import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { UserRole } from '@cineseat/shared';
import { RolesGuard } from './roles.guard';
import type { AuthUser } from '../interfaces/auth.interface';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const handler = {};
const controller = {};

describe('RolesGuard', () => {
  const required = jest.fn();
  const reflector = { getAllAndOverride: required } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const user: AuthUser = { id: 'usr_1', email: 'rina@cineseat.dev', role: 'USER' };
  const admin: AuthUser = { id: 'usr_2', email: 'admin@cineseat.dev', role: 'ADMIN' };

  beforeEach(() => required.mockReset());

  it('lets any signed-in user through a route without @Roles', () => {
    required.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('blocks a USER from an ADMIN route — the phase 1 acceptance check', () => {
    required.mockReturnValue(['ADMIN'] as UserRole[]);
    expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(user))).toThrow(/requires role: ADMIN/);
  });

  it('lets an ADMIN through the same route', () => {
    required.mockReturnValue(['ADMIN'] as UserRole[]);
    expect(guard.canActivate(contextFor(admin))).toBe(true);
  });

  it('accepts a route that allows either role', () => {
    required.mockReturnValue(['ADMIN', 'USER'] as UserRole[]);
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('refuses when no role metadata is present but nobody is signed in', () => {
    // Guards are declared in order (JwtAuthGuard then RolesGuard); this is the
    // safety net if a future route forgets the auth guard.
    required.mockReturnValue(['ADMIN'] as UserRole[]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
