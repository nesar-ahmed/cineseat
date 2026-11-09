import type { UserRole } from '@cineseat/shared';

/**
 * Shape attached to `request.user` by JwtStrategy after the token is verified.
 * It comes from the database, never from the client, so `role` is trustworthy.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Claims CineSeat signs into the access token (see AuthService.issueToken). */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
}
