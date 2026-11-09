import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { fromAuthCookie, JwtStrategy } from './jwt.strategy';
import { AUTH_COOKIE_NAME } from '../../common/constants/session';
import type { PrismaService } from '../../database/prisma.service';

describe('fromAuthCookie', () => {
  it('returns the token from the session cookie', () => {
    const request = { cookies: { [AUTH_COOKIE_NAME]: 'signed.jwt.value' } } as unknown as Request;
    expect(fromAuthCookie(request)).toBe('signed.jwt.value');
  });

  it('returns null when the cookie is missing or cookie parsing never ran', () => {
    expect(fromAuthCookie({ cookies: {} } as unknown as Request)).toBeNull();
    expect(fromAuthCookie({} as unknown as Request)).toBeNull();
    expect(fromAuthCookie(undefined)).toBeNull();
  });
});

describe('JwtStrategy.validate', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'jwtSecret' ? 'unit-test-secret-value-long-enough' : '1h')),
  } as unknown as jest.Mocked<ConfigService>;
  const strategy = new JwtStrategy(config, prisma as unknown as PrismaService);

  const claims = { sub: 'usr_1', email: 'rina@cineseat.dev', role: 'USER' as const };

  beforeEach(() => jest.clearAllMocks());

  it('returns the user the token points at, with the role read from the database', async () => {
    // A stale `role` claim in an old token must not survive: the DB row wins.
    prisma.user.findUnique.mockResolvedValue({ id: 'usr_1', email: 'rina@cineseat.dev', role: 'ADMIN' });

    await expect(strategy.validate({ ...claims, role: 'USER' })).resolves.toEqual({
      id: 'usr_1',
      email: 'rina@cineseat.dev',
      role: 'ADMIN',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'usr_1' },
      select: { id: true, email: true, role: true },
    });
  });

  it('rejects a token whose user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(claims)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a token signed with the configured secret and rejects one signed with another', async () => {
    const good = new JwtService({ secret: 'unit-test-secret-value-long-enough' });
    const evil = new JwtService({ secret: 'attacker-guessed-secret-key-123456' });

    const token = await good.signAsync(claims);
    const extracted = fromAuthCookie({ cookies: { [AUTH_COOKIE_NAME]: token } } as unknown as Request);
    expect(extracted).toBe(token);
    await expect(good.verifyAsync(extracted as string)).resolves.toMatchObject({ sub: 'usr_1' });

    const forged = await evil.signAsync({ sub: 'usr_2', email: 'admin@cineseat.dev', role: 'ADMIN' });
    await expect(good.verifyAsync(forged)).rejects.toThrow();
  });
});
