import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

/** `JWT_EXPIRES_IN` is a string like `7d`; jsonwebtoken types it as its own literal union. */
type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

/**
 * Session module: credentials in, JWT out, httpOnly cookie set.
 * `PassportModule` defaults to `session: false`, so nothing is stored server-side —
 * the token is the session (guideline 2.1).
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('jwtSecret'),
        signOptions: { expiresIn: config.getOrThrow<string>('jwtExpiresIn') as JwtExpiresIn },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
