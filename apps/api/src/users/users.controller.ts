import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AvatarSchema,
  ChangePasswordSchema,
  PaginatedUsersSchema,
  PublicUserSchema,
  UpdateProfileSchema,
  UserListQuerySchema,
  type Avatar,
  type ChangePasswordInput,
  type Paginated,
  type PublicUser,
  type UpdateProfileInput,
  type UserListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MAX_AVATAR_BYTES } from './avatar.storage';
import { UsersService } from './users.service';

/**
 * Profile endpoints (guideline section 10): `PATCH /users/me`,
 * `POST /users/me/password`, `POST /users/me/avatar`, plus the admin-only
 * `GET /users` that the phase 8 admin panel will page through.
 *
 * The account id always comes from the verified token, never from the body, so
 * one user cannot touch another user's profile (guideline 13: authorise by ownership).
 */
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update the signed-in user’s profile' })
  @ApiBody({ schema: toOpenApiSchema(UpdateProfileSchema), required: true })
  @ApiResponse({ status: 200, description: 'Profile after the update.', schema: toOpenApiSchema(PublicUserSchema) })
  @ApiResponse({ status: 400, description: 'Nothing to update, or a field is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  updateMe(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) input: UpdateProfileInput,
  ): Promise<PublicUser> {
    return this.users.updateProfile(userId, input);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the password (current one required)' })
  @ApiBody({ schema: toOpenApiSchema(ChangePasswordSchema), required: true })
  @ApiResponse({ status: 204, description: 'Password changed. Sessions stay valid until their token expires.' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect.', schema: ERROR_SCHEMA })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) input: ChangePasswordInput,
  ): Promise<void> {
    await this.users.changePassword(userId, input.currentPassword, input.newPassword);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload an avatar',
    description: `JPEG, PNG or WebP up to ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB. The previous avatar file is deleted.`,
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Public path of the new avatar.', schema: toOpenApiSchema(AvatarSchema) })
  @ApiResponse({ status: 400, description: 'Missing file, wrong type or too large.', schema: ERROR_SCHEMA })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Avatar> {
    if (!file) throw new BadRequestException('Send the image as the multipart field "file"');
    const avatarUrl = await this.users.setAvatar(userId, file.filename);
    return { avatarUrl };
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Page through accounts — ADMIN only' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'search', required: false, schema: { type: 'string' }, description: 'Matches name or email' })
  @ApiQuery({ name: 'role', required: false, schema: { type: 'string', enum: ['USER', 'ADMIN'] } })
  @ApiResponse({ status: 200, description: 'A page of accounts.', schema: toOpenApiSchema(PaginatedUsersSchema) })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: 'Signed in as USER — this route needs ADMIN.', schema: ERROR_SCHEMA })
  list(@Query(new ZodValidationPipe(UserListQuerySchema)) query: UserListQuery): Promise<Paginated<PublicUser>> {
    return this.users.list(query);
  }
}
