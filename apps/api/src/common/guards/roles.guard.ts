import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@cineseat/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../interfaces/auth.interface';

/**
 * Role gate (`@Roles('ADMIN')`). Runs after `JwtAuthGuard`, so `request.user`
 * is present. Authenticated-but-not-permitted is a 403, not a 401 — that is the
 * phase 1 acceptance check: admin routes are blocked for `USER` accounts.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new ForbiddenException('Sign in is required for this action');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`This action requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
