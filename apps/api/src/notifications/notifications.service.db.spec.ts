import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationListQuerySchema,
  ReadAllNotificationsSchema,
  UnreadCountQuerySchema,
} from '@cineseat/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditLog, Notification, User } from '../database/entities';
import { InventoryLane } from '../database/inventory-lane';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { NotificationsService } from './notifications.service';
import { notify, type NotificationMessage } from './notify';

const NOW = new Date('2026-11-12T06:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

/** The notifications API against a real SQLite file: ownership, filters, counts, fan-out. */
describe('NotificationsService (SQLite)', () => {
  let dir: string;
  let dataSource: DataSource;
  let lane: InventoryLane;
  let service: NotificationsService;
  let admin: string;
  let admin2: string;
  let alice: string;
  let bob: string;

  const send = (userId: string, message: NotificationMessage, when = NOW) =>
    lane.run((tx) => notify(tx, when, { ...message, userId }));
  const rows = (userId: string) =>
    dataSource.getRepository(Notification).find({ where: { userId }, order: { createdAt: 'ASC' } });
  const msg = (
    type: NotificationMessage['type'],
    title: string,
    extra: Partial<NotificationMessage> = {},
  ) => ({
    type,
    title,
    body: `${title} — body`,
    ...extra,
  });

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cineseat-notifications-'));
    dataSource = await new DataSource(buildDataSourceOptions(join(dir, 'test.db'))).initialize();
    await dataSource.runMigrations();
    lane = new InventoryLane(dataSource);
    service = new NotificationsService(dataSource.getRepository(Notification), lane);
    const users = dataSource.getRepository(User);
    const add = async (email: string, name: string, role = 'USER') =>
      (await users.save({ email, name, role, passwordHash: 'x' })).id;
    admin = await add('admin@cineseat.dev', 'Admin One', 'ADMIN');
    admin2 = await add('admin2@cineseat.dev', 'Admin Two', 'ADMIN');
    alice = await add('alice@cineseat.dev', 'Alice Rahman');
    bob = await add('bob@cineseat.dev', 'Bob');
  });

  afterEach(async () => {
    await dataSource.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists only your own, newest first, with category and links, paged', async () => {
    await send(alice, msg('BOOKING_CONFIRMED', 'Old', { bookingId: null }), at(0));
    await send(alice, msg('NEW_COUPON', 'Offer', { couponCode: 'WEEKEND10' }), at(1));
    await send(alice, msg('WELCOME', 'Hi'), at(2));
    await send(bob, msg('WELCOME', 'Not yours'), at(3));

    const page = await service.list(alice, { page: 1, pageSize: 2, category: [], type: [] });
    expect(page.total).toBe(3);
    expect(page.items.map((n) => n.title)).toEqual(['Hi', 'Offer']);
    expect(page.items[1]).toEqual({
      id: expect.any(String),
      type: 'NEW_COUPON',
      category: 'offers',
      title: 'Offer',
      body: 'Offer — body',
      readAt: null,
      createdAt: at(1).toISOString(),
      bookingId: null,
      showId: null,
      couponCode: 'WEEKEND10',
      subjectUserId: null,
    });
    const rest = await service.list(alice, { page: 2, pageSize: 2, category: [], type: [] });
    expect(rest.items.map((n) => n.title)).toEqual(['Old']);
  });

  it('filters by read state and by category', async () => {
    await send(alice, msg('BOOKING_CONFIRMED', 'Booked'));
    await send(alice, msg('HOLD_EXPIRED', 'Released'));
    await send(alice, msg('ACCOUNT_SECURITY', 'Password'));
    const [booked] = await rows(alice);
    await service.setRead(alice, booked.id, true, NOW);

    const titles = async (query: Parameters<NotificationsService['list']>[1]) =>
      (await service.list(alice, query)).items.map((n) => n.title).sort();
    const all = { page: 1, pageSize: 20, category: [], type: [] };
    expect(await titles({ ...all, status: 'unread' })).toEqual(['Password', 'Released']);
    expect(await titles({ ...all, status: 'read' })).toEqual(['Booked']);
    expect(await titles({ ...all, category: ['bookings'] })).toEqual(['Booked', 'Released']);
    expect(await titles({ ...all, category: ['account'], status: 'unread' })).toEqual(['Password']);
    expect(await titles({ ...all, category: ['admin'] })).toEqual([]);
    // Several categories at once: what the user panel asks for.
    expect(await titles({ ...all, category: ['account', 'admin'] })).toEqual(['Password']);
    // Types, alone or within a category (what the admin panel's filters ask for).
    expect(await titles({ ...all, type: ['HOLD_EXPIRED', 'ACCOUNT_SECURITY'] })).toEqual([
      'Password',
      'Released',
    ]);
    expect(await titles({ ...all, category: ['bookings'], type: ['HOLD_EXPIRED'] })).toEqual([
      'Released',
    ]);
    // A category and a type that do not overlap: nothing.
    await expect(
      service.list(alice, { ...all, category: ['offers'], type: ['HOLD_EXPIRED'] }),
    ).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('counts unread and totals per category', async () => {
    await send(alice, msg('BOOKING_CONFIRMED', 'a'));
    await send(alice, msg('REFUNDED', 'b'));
    await send(alice, msg('ANNOUNCEMENT', 'c'));
    await send(bob, msg('ANNOUNCEMENT', 'not counted'));
    const [first] = await rows(alice);
    await service.setRead(alice, first.id, true, NOW);

    await expect(service.unreadCount(alice)).resolves.toEqual({ unread: 2 });
    await expect(service.unreadCount(alice, ['bookings'])).resolves.toEqual({ unread: 1 });
    await expect(service.unreadCount(alice, ['account', 'admin'])).resolves.toEqual({ unread: 0 });
    const counts = await service.counts(alice);
    expect(counts).toMatchObject({
      total: 3,
      unread: 2,
      categories: {
        bookings: { total: 2, unread: 1 },
        offers: { total: 1, unread: 1 },
        account: { total: 0, unread: 0 },
        admin: { total: 0, unread: 0 },
      },
    });
    // Per type too, every type present (zero when there is none).
    expect(Object.keys(counts.types)).toHaveLength(19);
    expect(counts.types.BOOKING_CONFIRMED).toEqual({ total: 1, unread: 0 });
    expect(counts.types.REFUNDED).toEqual({ total: 1, unread: 1 });
    expect(counts.types.ADMIN_NEW_USER).toEqual({ total: 0, unread: 0 });
    await expect(service.unreadCount(admin)).resolves.toEqual({ unread: 0 });
  });

  it('marks read (keeping the first read time) and unread again; others’ answer 404', async () => {
    await send(alice, msg('WELCOME', 'Hi'));
    const [note] = await rows(alice);

    await expect(service.setRead(alice, note.id, true, at(1))).resolves.toMatchObject({
      readAt: at(1).toISOString(),
    });
    await expect(service.setRead(alice, note.id, true, at(5))).resolves.toMatchObject({
      readAt: at(1).toISOString(),
    });
    await expect(service.setRead(alice, note.id, false, at(6))).resolves.toMatchObject({
      readAt: null,
    });

    await expect(service.setRead(bob, note.id, true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setRead(alice, 'no-such-id', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await rows(alice))[0].readAt).toBeNull(); // Bob changed nothing
  });

  it('marks all as read — yours only, optionally some categories', async () => {
    await send(alice, msg('BOOKING_CONFIRMED', 'a'));
    await send(alice, msg('PAYMENT_FAILED', 'b'));
    await send(alice, msg('ANNOUNCEMENT', 'c'));
    await send(alice, msg('WELCOME', 'e'));
    await send(bob, msg('ANNOUNCEMENT', 'd'));

    await expect(service.readAll(alice, ['bookings'], at(1))).resolves.toEqual({ updated: 2 });
    await expect(service.unreadCount(alice)).resolves.toEqual({ unread: 2 });
    await expect(service.readAll(alice, ['offers', 'admin'], at(2))).resolves.toEqual({
      updated: 1,
    });
    await expect(service.readAll(alice, [], at(3))).resolves.toEqual({ updated: 1 });
    await expect(service.readAll(alice, [], at(4))).resolves.toEqual({ updated: 0 });
    await expect(service.unreadCount(bob)).resolves.toEqual({ unread: 1 });
  });

  it('removes your own; someone else’s stays and answers 404', async () => {
    await send(alice, msg('WELCOME', 'Hi'));
    const [note] = await rows(alice);

    await expect(service.remove(bob, note.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(rows(alice)).resolves.toHaveLength(1);
    await service.remove(alice, note.id);
    await expect(rows(alice)).resolves.toHaveLength(0);
    await expect(service.remove(alice, note.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes a message with a dedupe key once per account', async () => {
    const reminder = msg('SHOW_REMINDER', 'Soon', { dedupeKey: 'show-reminder-2h:b1' });
    await expect(send(alice, reminder)).resolves.toBe(true);
    await expect(send(alice, reminder, at(5))).resolves.toBe(false);
    await expect(send(bob, reminder)).resolves.toBe(true); // another account, its own copy
    // Without a key nothing is deduplicated.
    await send(alice, msg('ANNOUNCEMENT', 'Twice'));
    await send(alice, msg('ANNOUNCEMENT', 'Twice'));
    expect((await rows(alice)).map((n) => n.title)).toEqual(['Soon', 'Twice', 'Twice']);
  });

  it('welcomes a new account and tells every admin, once', async () => {
    const user = { id: alice, name: 'Alice Rahman', email: 'alice@cineseat.dev' };
    await service.welcomeNewUser(user, NOW);
    await service.welcomeNewUser(user, at(1)); // a retry writes nothing new

    expect((await rows(alice)).map((n) => [n.type, n.title])).toEqual([
      ['WELCOME', 'Welcome to CineSeat, Alice'],
    ]);
    for (const id of [admin, admin2]) {
      // It links to the new account, which is not its recipient.
      expect((await rows(id)).map((n) => n.subjectUserId)).toEqual([alice]);
      expect((await rows(id)).map((n) => [n.type, n.title, n.body])).toEqual([
        [
          'ADMIN_NEW_USER',
          'New sign-up: Alice Rahman',
          'Alice Rahman (alice@cineseat.dev) created an account.',
        ],
      ]);
    }
    await expect(rows(bob)).resolves.toHaveLength(0);
  });

  it('parses query strings the way the controller receives them', () => {
    const list = new ZodValidationPipe(NotificationListQuerySchema);
    // Nothing given: every filter is an empty list, never undefined.
    expect(list.transform({})).toEqual({ page: 1, pageSize: 20, category: [], type: [] });
    expect(
      list.transform({ category: 'bookings,offers', type: 'HOLD_EXPIRED', status: 'unread' }),
    ).toMatchObject({ category: ['bookings', 'offers'], type: ['HOLD_EXPIRED'], status: 'unread' });
    expect(() => list.transform({ type: 'NOT_A_TYPE' })).toThrow(BadRequestException);
    expect(new ZodValidationPipe(UnreadCountQuerySchema).transform({})).toEqual({ category: [] });
    // read-all with no body at all.
    expect(new ZodValidationPipe(ReadAllNotificationsSchema).transform(undefined)).toEqual({});
  });

  it('never throws from sendTo: a message that cannot be written is only logged', async () => {
    await expect(
      service.sendTo('no-such-user', msg('ACCOUNT_SECURITY', 'x')),
    ).resolves.toBeUndefined();
  });

  it('announces to an audience, one copy each, and audits who sent it', async () => {
    const input = { title: 'New cinema', body: 'Mirpur opens Friday.', audience: 'USERS' as const };
    await expect(service.announce(admin, input, NOW)).resolves.toEqual({ recipients: 2 });
    await expect(service.announce(admin, { ...input, audience: 'ADMINS' }, NOW)).resolves.toEqual({
      recipients: 2,
    });
    await expect(service.announce(admin, { ...input, audience: 'ALL' }, NOW)).resolves.toEqual({
      recipients: 4,
    });

    expect((await rows(alice)).map((n) => [n.type, n.title, n.body])).toEqual([
      ['ANNOUNCEMENT', 'New cinema', 'Mirpur opens Friday.'],
      ['ANNOUNCEMENT', 'New cinema', 'Mirpur opens Friday.'],
    ]);
    await expect(rows(admin2)).resolves.toHaveLength(2);
    const audit = await dataSource.getRepository(AuditLog).find({ order: { action: 'ASC' } });
    expect(audit.map((a) => [a.actorId, a.action, a.entity])).toEqual([
      [admin, 'notifications.announce:ADMINS', 'notifications'],
      [admin, 'notifications.announce:ALL', 'notifications'],
      [admin, 'notifications.announce:USERS', 'notifications'],
    ]);
  });
});
