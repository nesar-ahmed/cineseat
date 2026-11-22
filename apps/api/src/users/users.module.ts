import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { avatarMulterOptions } from './avatar.storage';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Profiles and avatars; for ADMIN accounts, the account list and pages
 * (`/admin/users`) and role changes. `FileInterceptor('file')` in the controller picks up
 * the type/size limits and generated filenames from `avatarMulterOptions`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    NotificationsModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        avatarMulterOptions(config.getOrThrow<string>('uploadDir')),
    }),
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  // The User repository is re-exported for JwtStrategy (AuthModule imports this module).
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
