import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import type { PrismaService } from '../database/prisma.service';

const SECRET = 'unit-test-secret-at-least-16-chars';

function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_1',
    email: 'rina@cineseat.dev',
    passwordHash: hashSync('User@123', 4),
    name: 'Rina Ahmed',
    phone: '01700000001',
    avatarPath: null,
    role: 'USER',
    preferredCity: 'Dhaka',
    preferredGenres: 'Action,Drama',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const config = { get: jest.fn(), getOrThrow: jest.fn() } as unknown as jest.Mocked<ConfigService>;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.getOrThrow.mockImplementation((key: string) =>
      key === 'jwtExpiresIn' ? '1h' : key === 'nodeEnv' ? 'test' : 'x',
    );
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    service = new AuthService(new UsersService(prisma as unknown as PrismaService, config), jwt, config);
  });

  it('signup stores a bcrypt hash, never the plain password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: { data: Partial<User> }) =>
      Promise.resolve(userRow({ ...data, id: 'usr_new' } as Partial<User> as User)),
    );

    const session = await service.signup({ name: 'New User', email: 'new@cineseat.dev', password: 'Passw0rd' });

    const created = prisma.user.create.mock.calls[0][0] as { data: { passwordHash: string; role?: string } };
    expect(created.data.passwordHash).not.toBe('Passw0rd');
    expect(created.data.passwordHash.startsWith('$2')).toBe(true);
    expect(created.data.role).toBeUndefined(); // role comes from the DB default, not the client
    expect(session.user).not.toHaveProperty('passwordHash');
  });

  it('signup rejects an email that is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await expect(service.signup({ name: 'Copy', email: 'rina@cineseat.dev', password: 'Passw0rd' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('signup issues a session cookie token that carries the user id and role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow({ id: 'usr_new', email: 'new@cineseat.dev' }));

    const session = await service.signup({ name: 'New User', email: 'new@cineseat.dev', password: 'Passw0rd' });

    await expect(jwt.verifyAsync(session.token)).resolves.toMatchObject({
      sub: 'usr_new',
      email: 'new@cineseat.dev',
      role: 'USER',
    });
    // Cookie lifetime is derived from `exp`, so the two cannot drift apart.
    expect(session.maxAgeMs).toBeGreaterThan(55 * 60 * 1000);
    expect(session.maxAgeMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('login accepts the correct password and returns the profile', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ role: 'ADMIN' }));
    const session = await service.login({ email: 'rina@cineseat.dev', password: 'User@123' });

    expect(session.user.role).toBe('ADMIN');
    expect(session.user.preferredGenres).toEqual(['Action', 'Drama']);
    await expect(jwt.verifyAsync(session.token)).resolves.toMatchObject({ sub: 'usr_1', role: 'ADMIN' });
  });

  it('login answers identically for a wrong password and an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    const wrongPassword = await service
      .login({ email: 'rina@cineseat.dev', password: 'WrongPass123' })
      .catch((error: unknown) => error);

    prisma.user.findUnique.mockResolvedValue(null);
    const unknownEmail = await service
      .login({ email: 'ghost@cineseat.dev', password: 'User@123' })
      .catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    // Same message both ways: nothing tells the caller whether the account exists.
    expect((wrongPassword as UnauthorizedException).message).toBe('Invalid email or password');
    expect((unknownEmail as UnauthorizedException).message).toBe('Invalid email or password');
  });

  it('cookie options keep the token out of JavaScript and off other schemes', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    const session = await service.login({ email: 'rina@cineseat.dev', password: 'User@123' });
    expect(service.cookieOptions(session.maxAgeMs)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // nodeEnv is 'test'; production flips this on
      path: '/',
      maxAge: session.maxAgeMs,
    });
  });

  it('me() re-reads the profile from the database instead of trusting the token', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ name: 'Renamed' }));
    await expect(service.getProfile('usr_1')).resolves.toMatchObject({ id: 'usr_1', name: 'Renamed' });
  });
});
