import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { avatarMulterOptions } from './avatar.storage';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Profiles and avatars. `FileInterceptor('file')` in the controller picks up
 * the type/size limits and generated filenames from `avatarMulterOptions`.
 */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        avatarMulterOptions(config.getOrThrow<string>('uploadDir')),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
