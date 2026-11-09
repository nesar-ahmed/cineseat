import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../interfaces/auth.interface';

/**
 * Requires a valid session: the JWT is read from the httpOnly cookie (or a
 * Bearer token, so Swagger UI "Try it out" works) and the user is re-fetched
 * from the database by `JwtStrategy.validate`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: unknown,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      // A strategy error (expired/unknown user) keeps its own 401 shape;
      // anything else gets one generic message — never echo the token back.
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Sign in is required for this action');
    }
    return user as TUser;
  }
}
