import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@cineseat/shared';

export const ROLES_KEY = 'cineseat:roles';

/**
 * Marks a route (or a whole controller) as requiring one of these roles.
 * Enforced by `RolesGuard`, which must run after `JwtAuthGuard`.
 *
 * `@Roles('ADMIN')`
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
