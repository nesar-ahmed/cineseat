import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth.interface';

/**
 * Injects the verified user attached by `JwtStrategy`:
 *
 * `me(@CurrentUser() user: AuthUser)` or `me(@CurrentUser('id') userId: string)`
 *
 * Ownership is always taken from the token, never from the request body (guideline 13).
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return field ? user?.[field] : user;
  },
);
