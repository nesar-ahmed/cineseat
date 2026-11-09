import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions } from 'express';
import type { LoginInput, PublicUser, SignupInput } from '@cineseat/shared';
import { hashPassword, verifyPassword } from '../common/security/password';
import type { JwtPayload } from '../common/interfaces/auth.interface';
import { UsersService } from '../users/users.service';

/** What a successful signup/login hands to the controller. */
export interface AuthSession {
  user: PublicUser;
  token: string;
  /** Cookie lifetime in ms, derived from the token's own `exp` claim. */
  maxAgeMs: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(input: SignupInput): Promise<AuthSession> {
    const taken = await this.users.findByEmailWithSecret(input.email);
    if (taken) throw new ConflictException('An account with this email already exists');

    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    });
    return this.issueSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const account = await this.users.findByEmailWithSecret(input.email);
    // The hash is looked up before comparing, and both failures answer identically,
    // so neither timing nor the message tells an attacker whether the email exists.
    const matches = account ? await verifyPassword(input.password, account.passwordHash) : false;
    if (!account || !matches) throw new UnauthorizedException('Invalid email or password');

    return this.issueSession(this.users.toPublicUser(account));
  }

  /** Profile for `GET /auth/me` — read from the database, not from the token. */
  getProfile(userId: string): Promise<PublicUser> {
    return this.users.getProfile(userId);
  }

  private async issueSession(user: PublicUser): Promise<AuthSession> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const token = await this.jwt.signAsync(payload);
    return { user, token, maxAgeMs: this.maxAgeOf(token) };
  }

  /** Cookie lifetime follows `exp`, so the session cannot outlive its own token. */
  private maxAgeOf(token: string): number {
    const { exp } = this.jwt.decode<{ exp?: number }>(token);
    return exp ? Math.max(exp * 1000 - Date.now(), 0) : 0;
  }

  /**
   * httpOnly + SameSite=Lax keeps the token out of JavaScript (guideline 13);
   * `secure` is on in production, where the API is expected to sit behind TLS.
   */
  cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('nodeEnv') === 'production',
      path: '/',
      maxAge: maxAgeMs,
    };
  }
}
