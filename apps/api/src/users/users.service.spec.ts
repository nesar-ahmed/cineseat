import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { hashSync } from 'bcryptjs';
import { unlink } from 'node:fs/promises';
import { FindOperator, type FindManyOptions, type Repository } from 'typeorm';
import { UsersService } from './users.service';
import { verifyPassword } from '../common/security/password';
import { User } from '../database/entities';
import type { NotificationsService } from '../notifications/notifications.service';

jest.mock('node:fs/promises', () => ({ unlink: jest.fn(() => Promise.resolve()) }));

const UPLOAD_DIR = '/tmp/opencode/uploads-test';

function userRow(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'usr_1',
    email: 'rina@cineseat.dev',
    passwordHash: hashSync('User@123', 4),
    name: 'Rina Ahmed',
    phone: '01700000001',
    avatarPath: '/uploads/avatars/old.jpg',
    role: 'USER',
    preferredCity: 'Dhaka',
    preferredGenres: 'Action,Drama',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('UsersService', () => {
  const users = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findAndCount: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn(() => UPLOAD_DIR),
  } as unknown as jest.Mocked<ConfigService>;
  const notifications = { sendTo: jest.fn(() => Promise.resolve()) };
  const service = new UsersService(
    users as unknown as Repository<User>,
    config,
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (unlink as jest.Mock).mockResolvedValue(undefined);
  });

  it('maps a row to the public shape: hash hidden, genres split, dates ISO', () => {
    const publicUser = service.toPublicUser(userRow());
    expect(publicUser).toEqual({
      id: 'usr_1',
      email: 'rina@cineseat.dev',
      name: 'Rina Ahmed',
      phone: '01700000001',
      avatarUrl: '/uploads/avatars/old.jpg',
      role: 'USER',
      preferredCity: 'Dhaka',
      preferredGenres: ['Action', 'Drama'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser).not.toHaveProperty('preferredGenresRaw');
  });

  it('updateProfile stores genres comma-separated and deduplicated, leaving other fields alone', async () => {
    users.findOne.mockResolvedValue(userRow());
    users.update.mockResolvedValue({ affected: 1 });

    const updated = await service.updateProfile('usr_1', { preferredGenres: ['Sci-Fi', 'Sci-Fi', 'Action'] });

    const [criteria, stored] = users.update.mock.calls[0] as [object, Partial<User>];
    expect(criteria).toEqual({ id: 'usr_1' });
    // Only the field that was sent is written: no `name: undefined` reaching the UPDATE.
    expect(stored).toEqual({ preferredGenres: 'Sci-Fi,Action' });
    expect(updated.preferredGenres).toEqual(['Sci-Fi', 'Action']);
    expect(updated.name).toBe('Rina Ahmed');
  });

  it('changePassword needs the current password and stores a new hash', async () => {
    users.findOne.mockResolvedValue(userRow());
    users.update.mockResolvedValue({ affected: 1 });

    await expect(service.changePassword('usr_1', 'Nope1234', 'BrandNew1')).rejects.toThrow(BadRequestException);
    await expect(service.changePassword('usr_1', 'User@123', 'User@123')).rejects.toThrow(BadRequestException);
    expect(users.update).not.toHaveBeenCalled();
    expect(notifications.sendTo).not.toHaveBeenCalled();

    await service.changePassword('usr_1', 'User@123', 'BrandNew1');
    expect(notifications.sendTo).toHaveBeenCalledWith(
      'usr_1',
      expect.objectContaining({ type: 'ACCOUNT_SECURITY', title: 'Your password was changed' }),
    );
    const { passwordHash } = users.update.mock.calls[0][1] as { passwordHash: string };
    expect(passwordHash).not.toBe('BrandNew1');
    await expect(verifyPassword('BrandNew1', passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('User@123', passwordHash)).resolves.toBe(false);
  });

  it('changeEmail needs the current password, refuses the same or a taken address, then writes it', async () => {
    users.findOne.mockResolvedValue(userRow());

    // Wrong password: refused before the address is even looked up.
    await expect(service.changeEmail('usr_1', 'new@cineseat.dev', 'Nope1234')).rejects.toThrow(
      BadRequestException,
    );
    expect(users.findOne).toHaveBeenCalledTimes(1);
    await expect(service.changeEmail('usr_1', 'rina@cineseat.dev', 'User@123')).rejects.toThrow(
      'This is already your email address',
    );

    // Taken by someone else: the second findOne (the uniqueness check) finds a row.
    users.findOne.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ id: 'usr_2' });
    await expect(service.changeEmail('usr_1', 'karim@cineseat.dev', 'User@123')).rejects.toThrow(
      ConflictException,
    );
    expect(users.update).not.toHaveBeenCalled();
    expect(notifications.sendTo).not.toHaveBeenCalled();

    users.findOne.mockResolvedValueOnce(userRow()).mockResolvedValueOnce(null);
    users.update.mockResolvedValue({ affected: 1 });
    const updated = await service.changeEmail('usr_1', 'rina.new@cineseat.dev', 'User@123');
    expect(users.update).toHaveBeenCalledWith({ id: 'usr_1' }, { email: 'rina.new@cineseat.dev' });
    expect(updated).toMatchObject({ id: 'usr_1', email: 'rina.new@cineseat.dev', name: 'Rina Ahmed' });
    expect(updated).not.toHaveProperty('passwordHash');
    expect(notifications.sendTo).toHaveBeenCalledWith(
      'usr_1',
      expect.objectContaining({
        type: 'ACCOUNT_SECURITY',
        body: expect.stringContaining('rina.new@cineseat.dev instead of rina@cineseat.dev'),
      }),
    );
  });

  it('setAvatar writes the generated path and deletes the previous avatar file', async () => {
    users.findOne.mockResolvedValue(userRow({ avatarPath: '/uploads/avatars/old.jpg' }));
    users.update.mockResolvedValue({ affected: 1 });

    const avatarUrl = await service.setAvatar('usr_1', 'new.png');

    expect(avatarUrl).toBe('/uploads/avatars/new.png');
    expect(users.update.mock.calls[0]).toEqual([{ id: 'usr_1' }, { avatarPath: '/uploads/avatars/new.png' }]);
    expect(unlink).toHaveBeenCalledWith(`${UPLOAD_DIR}/avatars/old.jpg`);
  });

  it('setAvatar never deletes files outside the avatars folder', async () => {
    users.findOne.mockResolvedValue(userRow({ avatarPath: null }));
    users.update.mockResolvedValue({ affected: 1 });
    await service.setAvatar('usr_1', 'a.jpg');
    expect(unlink).not.toHaveBeenCalled();

    users.findOne.mockResolvedValue(userRow({ avatarPath: '/uploads/avatars/../../secrets.env' }));
    users.update.mockResolvedValue({ affected: 1 });
    await service.setAvatar('usr_1', 'b.jpg');
    expect(unlink).not.toHaveBeenCalled();
  });

  it('list filters by role and search, and pages with the shared query shape', async () => {
    users.findAndCount.mockResolvedValue([[userRow()], 1]);

    const page = await service.list({ page: 2, pageSize: 5, role: 'ADMIN', search: 'admin' });

    const findArgs = users.findAndCount.mock.calls[0][0] as FindManyOptions<User>;
    // Two OR-ed conditions, both keeping the role filter: (role AND name~) OR (role AND email~).
    const where = findArgs.where as Record<string, unknown>[];
    expect(where).toHaveLength(2);
    expect(where[0]).toMatchObject({ role: 'ADMIN', name: expect.any(FindOperator) });
    expect(where[1]).toMatchObject({ role: 'ADMIN', email: expect.any(FindOperator) });
    expect(findArgs.order).toEqual({ createdAt: 'DESC' });
    expect(findArgs.skip).toBe(5);
    expect(findArgs.take).toBe(5);
    expect(page).toEqual({ items: [service.toPublicUser(userRow())], total: 1, page: 2, pageSize: 5 });
  });

  it('getProfile 404s for an unknown id rather than returning null', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.getProfile('gone')).rejects.toThrow(NotFoundException);
  });
});
