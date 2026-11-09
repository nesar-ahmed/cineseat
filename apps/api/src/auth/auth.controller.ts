import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  AuthResponseSchema,
  LoginSchema,
  SignupSchema,
  type AuthResponse,
  type LoginInput,
  type MeResponse,
  type SignupInput,
} from '@cineseat/shared';
import { AUTH_THROTTLE } from './auth.constants';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

/**
 * Session endpoints (guideline section 10): `POST /auth/signup`, `/auth/login`,
 * `/auth/logout`, `GET /auth/me`.
 *
 * The token travels only in an httpOnly cookie, so it is never returned in a
 * body and never readable from page JavaScript.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Create a USER account and start a session' })
  @ApiBody({ schema: toOpenApiSchema(SignupSchema), required: true })
  @ApiResponse({ status: 201, description: 'Account created and the session cookie is set.', schema: toOpenApiSchema(AuthResponseSchema) })
  @ApiResponse({ status: 400, description: 'Invalid name, email or password.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'An account with this email already exists.', schema: ERROR_SCHEMA })
  async signup(
    @Body(new ZodValidationPipe(SignupSchema)) input: SignupInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.signup(input);
    res.cookie(AUTH_COOKIE_NAME, session.token, this.auth.cookieOptions(session.maxAgeMs));
    return { user: session.user };
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ schema: toOpenApiSchema(LoginSchema), required: true })
  @ApiResponse({ status: 200, description: 'Signed in; the session cookie is set.', schema: toOpenApiSchema(AuthResponseSchema) })
  @ApiResponse({ status: 401, description: 'Wrong email or password — the same answer for both.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 429, description: 'Too many attempts from this IP, slow down.', schema: ERROR_SCHEMA })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(input);
    res.cookie(AUTH_COOKIE_NAME, session.token, this.auth.cookieOptions(session.maxAgeMs));
    return { user: session.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the session cookie' })
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiResponse({ status: 204, description: 'Cookie removed. Safe to call when already signed out.' })
  logout(@Res({ passthrough: true }) res: Response): void {
    // The token is stateless: logging out removes it from the browser, and it
    // stops working entirely once it expires.
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Profile of the signed-in user' })
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiResponse({ status: 200, description: 'Current session owner.', schema: toOpenApiSchema(AuthResponseSchema) })
  @ApiResponse({ status: 401, description: 'Missing, expired or tampered session.', schema: ERROR_SCHEMA })
  async me(@CurrentUser('id') userId: string): Promise<MeResponse> {
    return { user: await this.auth.getProfile(userId) };
  }
}
