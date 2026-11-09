import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../../common/constants/session';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser, JwtPayload } from '../../common/interfaces/auth.interface';

/** Reads the session cookie set by the API; `undefined` means "not signed in". */
export function fromAuthCookie(request: Request | undefined): string | null {
  const cookies = request?.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[AUTH_COOKIE_NAME] ?? null;
}

/**
 * Verifies the signed JWT and loads the user from the database.
 *
 * The role is re-read on every request, so changing an account to `ADMIN` (or
 * deleting it) takes effect without waiting for the token to expire.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromAuthCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      secretOrKey: config.getOrThrow<string>('jwtSecret'),
      ignoreExpiration: false,
      // Pass the raw payload through: `validate` below is where the user is loaded.
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Session is no longer valid, sign in again');
    return { id: user.id, email: user.email, role: user.role as AuthUser['role'] };
  }
}
