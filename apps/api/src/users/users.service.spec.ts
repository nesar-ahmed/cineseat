import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { unlink } from 'node:fs/promises';
import { UsersService } from './users.service';
import { verifyPassword } from '../common/security/password';
import type { PrismaService } from '../database/prisma.service';

jest.mock('node:fs/promises', () => ({ unlink: jest.fn(() => Promise.resolve()) }));

const UPLOAD_DIR = '/tmp/opencode/uploads-test';

function userRow(overrides: Partial<User> = {}): User {
  return {
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
  };
}

describe('UsersService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn(() => UPLOAD_DIR),
  } as unknown as jest.Mocked<ConfigService>;
  const service = new UsersService(prisma as unknown as PrismaService, config);

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
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.update.mockImplementation(({ data }) => Promise.resolve(userRow({ ...userRow(), ...data })));

    const updated = await service.updateProfile('usr_1', { preferredGenres: ['Sci-Fi', 'Sci-Fi', 'Action'] });

    const stored = prisma.user.update.mock.calls[0][0] as { data: { preferredGenres: string; name?: string } };
    expect(stored.data.preferredGenres).toBe('Sci-Fi,Action');
    expect(stored.data.name).toBeUndefined();
    expect(updated.preferredGenres).toEqual(['Sci-Fi', 'Action']);
  });

  it('changePassword needs the current password and stores a new hash', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.update.mockResolvedValue(userRow());

    await expect(service.changePassword('usr_1', 'Nope1234', 'BrandNew1')).rejects.toThrow(BadRequestException);
    await expect(service.changePassword('usr_1', 'User@123', 'User@123')).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();

    await service.changePassword('usr_1', 'User@123', 'BrandNew1');
    const { passwordHash } = (prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }).data;
    expect(passwordHash).not.toBe('BrandNew1');
    await expect(verifyPassword('BrandNew1', passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('User@123', passwordHash)).resolves.toBe(false);
  });

  it('setAvatar writes the generated path and deletes the previous avatar file', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ avatarPath: '/uploads/avatars/old.jpg' }));
    prisma.user.update.mockResolvedValue(userRow({ avatarPath: '/uploads/avatars/new.png' }));

    const avatarUrl = await service.setAvatar('usr_1', 'new.png');

    expect(avatarUrl).toBe('/uploads/avatars/new.png');
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({ data: { avatarPath: '/uploads/avatars/new.png' } });
    expect(unlink).toHaveBeenCalledWith(`${UPLOAD_DIR}/avatars/old.jpg`);
  });

  it('setAvatar never deletes files outside the avatars folder', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ avatarPath: null }));
    prisma.user.update.mockResolvedValue(userRow());
    await service.setAvatar('usr_1', 'a.jpg');
    expect(unlink).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValue(userRow({ avatarPath: '/uploads/avatars/../../secrets.env' }));
    prisma.user.update.mockResolvedValue(userRow());
    await service.setAvatar('usr_1', 'b.jpg');
    expect(unlink).not.toHaveBeenCalled();
  });

  it('list filters by role and search, and pages with the shared query shape', async () => {
    prisma.user.findMany.mockResolvedValue([userRow()]);
    prisma.user.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));

    const page = await service.list({ page: 2, pageSize: 5, role: 'ADMIN', search: 'admin' });

    const findArgs = (prisma.user.findMany.mock.calls[0] as [{ where: object; skip: number; take: number }])[0];
    expect(findArgs.where).toEqual({
      role: 'ADMIN',
      OR: [{ name: { contains: 'admin' } }, { email: { contains: 'admin' } }],
    });
    expect(findArgs.skip).toBe(5);
    expect(findArgs.take).toBe(5);
    expect(page).toEqual({ items: [service.toPublicUser(userRow())], total: 1, page: 2, pageSize: 5 });
  });

  it('getProfile 404s for an unknown id rather than returning null', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('gone')).rejects.toThrow(NotFoundException);
  });
});
