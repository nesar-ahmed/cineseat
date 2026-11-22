import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { hashSync } from 'bcryptjs';
import type { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { User } from '../database/entities';

const SECRET = 'unit-test-secret-at-least-16-chars';

function userRow(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
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
  });
}

describe('AuthService', () => {
  const users = {
    findOne: jest.fn(),
    // `create` only builds the entity in memory; `save` is the INSERT.
    create: jest.fn((data: Partial<User>) => Object.assign(new User(), data)),
    save: jest.fn(),
    update: jest.fn(),
  };
  const config = { get: jest.fn(), getOrThrow: jest.fn() } as unknown as jest.Mocked<ConfigService>;
  const notifications = {
    welcomeNewUser: jest.fn(() => Promise.resolve()),
    sendTo: jest.fn(() => Promise.resolve()),
  };
  const notifier = notifications as unknown as NotificationsService;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.getOrThrow.mockImplementation((key: string) =>
      key === 'jwtExpiresIn' ? '1h' : key === 'nodeEnv' ? 'test' : 'x',
    );
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    service = new AuthService(
      new UsersService(users as unknown as Repository<User>, config, notifier),
      jwt,
      config,
      notifier,
    );
  });

  it('signup stores a bcrypt hash, never the plain password', async () => {
    users.findOne.mockResolvedValue(null);
    // Like the database: the row gets an id, and columns the insert left out keep their defaults.
    users.save.mockImplementation((entity: User) =>
      Promise.resolve(userRow({ id: 'usr_new', email: entity.email, name: entity.name, passwordHash: entity.passwordHash })),
    );

    const session = await service.signup({ name: 'New User', email: 'new@cineseat.dev', password: 'Passw0rd' });

    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.passwordHash).not.toBe('Passw0rd');
    expect(saved.passwordHash.startsWith('$2')).toBe(true);
    expect(saved.role).toBeUndefined(); // role comes from the DB default, not the client
    expect(session.user).not.toHaveProperty('passwordHash');
    // The new account is welcomed (and the admins told) once it exists.
    expect(notifications.welcomeNewUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'usr_new', name: 'New User', email: 'new@cineseat.dev' }),
    );
  });

  it('signup rejects an email that is already taken', async () => {
    users.findOne.mockResolvedValue(userRow());
    await expect(service.signup({ name: 'Copy', email: 'rina@cineseat.dev', password: 'Passw0rd' })).rejects.toThrow(
      ConflictException,
    );
    expect(users.save).not.toHaveBeenCalled();
    expect(notifications.welcomeNewUser).not.toHaveBeenCalled();
  });

  it('signup issues a session cookie token that carries the user id and role', async () => {
    users.findOne.mockResolvedValue(null);
    users.save.mockResolvedValue(userRow({ id: 'usr_new', email: 'new@cineseat.dev' }));

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
    users.findOne.mockResolvedValue(userRow({ role: 'ADMIN' }));
    const session = await service.login({ email: 'rina@cineseat.dev', password: 'User@123' });

    expect(session.user.role).toBe('ADMIN');
    expect(session.user.preferredGenres).toEqual(['Action', 'Drama']);
    await expect(jwt.verifyAsync(session.token)).resolves.toMatchObject({ sub: 'usr_1', role: 'ADMIN' });
  });

  it('login answers identically for a wrong password and an unknown email', async () => {
    users.findOne.mockResolvedValue(userRow());
    const wrongPassword = await service
      .login({ email: 'rina@cineseat.dev', password: 'WrongPass123' })
      .catch((error: unknown) => error);

    users.findOne.mockResolvedValue(null);
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
    users.findOne.mockResolvedValue(userRow());
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
    users.findOne.mockResolvedValue(userRow({ name: 'Renamed' }));
    await expect(service.getProfile('usr_1')).resolves.toMatchObject({ id: 'usr_1', name: 'Renamed' });
  });
});
