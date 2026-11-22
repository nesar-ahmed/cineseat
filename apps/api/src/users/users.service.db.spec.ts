import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { hashPassword } from '../common/security/password';
import { Notification, User } from '../database/entities';
import { InventoryLane } from '../database/inventory-lane';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { NotificationsService } from '../notifications/notifications.service';

/** UsersService against a real SQLite file, to pin down what the mocks cannot: SQL semantics. */
describe('UsersService (SQLite)', () => {
  let dir: string;
  let dataSource: DataSource;
  let service: UsersService;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cineseat-users-'));
    dataSource = await new DataSource(buildDataSourceOptions(join(dir, 'test.db'))).initialize();
    await dataSource.runMigrations();
    const config = { getOrThrow: jest.fn(() => join(dir, 'uploads')) } as unknown as ConfigService;
    const notifications = new NotificationsService(
      dataSource.getRepository(Notification),
      new InventoryLane(dataSource),
    );
    service = new UsersService(dataSource.getRepository(User), config, notifications);

    const rows = [
      { email: 'admin@cineseat.dev', name: 'CineSeat Admin', role: 'ADMIN' },
      { email: 'rina@cineseat.dev', name: 'Rina Ahmed', role: 'USER' },
      { email: 'karim@cineseat.dev', name: 'Karim Hossain', role: 'USER' },
      { email: 'promo_50%@cineseat.dev', name: 'Promo Desk', role: 'USER' },
    ];
    for (const row of rows)
      await dataSource.getRepository(User).insert({ ...row, passwordHash: 'x' });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('create() makes a USER with a timestamp, and a duplicate email is a 409', async () => {
    const created = await service.create({
      email: 'new@cineseat.dev',
      name: 'New User',
      passwordHash: 'x',
    });
    expect(created).toMatchObject({ email: 'new@cineseat.dev', role: 'USER' });
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);

    // The race path: the pre-check in AuthService passed, but the unique index wins.
    await expect(
      service.create({ email: 'new@cineseat.dev', name: 'Again', passwordHash: 'x' }),
    ).rejects.toThrow(ConflictException);
  });

  it('updateProfile writes only the fields that were sent', async () => {
    const rina = await service.findByEmailWithSecret('rina@cineseat.dev');
    await service.updateProfile(rina!.id, { phone: '01700000001' });
    await service.updateProfile(rina!.id, { preferredGenres: ['Drama', 'Drama', 'Action'] });

    const stored = await service.findById(rina!.id);
    expect(stored).toMatchObject({
      name: 'Rina Ahmed',
      phone: '01700000001',
      preferredGenres: 'Drama,Action',
    });
  });

  it('changeEmail writes the new address, and the unique index still guards it', async () => {
    const repo = dataSource.getRepository(User);
    await repo.insert({ email: 'mover@cineseat.dev', name: 'Mover', passwordHash: await hashPassword('Move1234') });
    const mover = await service.findByEmailWithSecret('mover@cineseat.dev');

    const updated = await service.changeEmail(mover!.id, 'moved@cineseat.dev', 'Move1234');
    expect(updated.email).toBe('moved@cineseat.dev');
    // Sign-in now finds the account by the new address only.
    expect((await service.findByEmailWithSecret('moved@cineseat.dev'))?.id).toBe(mover!.id);
    expect(await service.findByEmailWithSecret('mover@cineseat.dev')).toBeNull();

    await expect(service.changeEmail(mover!.id, 'karim@cineseat.dev', 'Move1234')).rejects.toThrow(
      ConflictException,
    );
    expect((await service.findById(mover!.id)).email).toBe('moved@cineseat.dev');

    // One security notice, for the change that happened — not for the refused one.
    const notices = await dataSource.getRepository(Notification).findBy({ userId: mover!.id });
    expect(notices.map((n) => [n.type, n.title])).toEqual([
      ['ACCOUNT_SECURITY', 'Your sign-in email was changed'],
    ]);
  });

  it('list() searches name or email, ignoring case, and keeps the role filter', async () => {
    const byName = await service.list({ page: 1, pageSize: 20, search: 'KARIM' });
    expect(byName.items.map((u) => u.email)).toEqual(['karim@cineseat.dev']);

    const byEmail = await service.list({ page: 1, pageSize: 20, search: 'admin@' });
    expect(byEmail.total).toBe(1);

    const adminsMatchingCineseat = await service.list({
      page: 1,
      pageSize: 20,
      search: 'cineseat',
      role: 'ADMIN',
    });
    expect(adminsMatchingCineseat.items.map((u) => u.email)).toEqual(['admin@cineseat.dev']);
  });

  it('list() treats % and _ in the search as plain characters', async () => {
    const literal = await service.list({ page: 1, pageSize: 20, search: '_50%' });
    expect(literal.items.map((u) => u.email)).toEqual(['promo_50%@cineseat.dev']);

    const noWildcard = await service.list({ page: 1, pageSize: 20, search: '%' });
    expect(noWildcard.total).toBe(1);
  });

  it('list() pages with a total that ignores the page size', async () => {
    const first = await service.list({ page: 1, pageSize: 2 });
    const second = await service.list({ page: 2, pageSize: 2 });
    expect(first.total).toBe(second.total);
    expect(first.items).toHaveLength(2);
    const ids = new Set([...first.items, ...second.items].map((u) => u.id));
    expect(ids.size).toBe(first.items.length + second.items.length);
  });
});
