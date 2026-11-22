import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AvatarSchema,
  ChangeEmailSchema,
  ChangePasswordSchema,
  ChangeUserRoleSchema,
  PaginatedUsersSchema,
  PublicUserSchema,
  UpdateProfileSchema,
  UserListQuerySchema,
  type Avatar,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type ChangeUserRoleInput,
  type Paginated,
  type PublicUser,
  type UpdateProfileInput,
  type UserListQuery,
} from '@cineseat/shared';
import { AUTH_THROTTLE } from '../auth/auth.constants';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MAX_AVATAR_BYTES } from './avatar.storage';
import { AdminUsersService } from './admin-users.service';
import { UsersService } from './users.service';

/**
 * Profile endpoints (guideline section 10): `PATCH /users/me`,
 * `PATCH /users/me/email`, `POST /users/me/password`, `POST /users/me/avatar`, plus the admin-only
 * `GET /users` and `PATCH /users/:id/role` (the admin panel reads accounts through `/admin/users`).
 *
 * The account id always comes from the verified token, never from the body, so
 * one user cannot touch another user's profile (guideline 13: authorise by ownership).
 */
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly adminUsers: AdminUsersService,
  ) {}

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

  @Patch('me/email')
  // It checks a password, so it gets the login limit rather than the global one.
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Change the sign-in email (current password required)',
    description:
      'The new address is trimmed and lowercased. The session stays valid: it is tied to the account, not to the email.',
  })
  @ApiBody({ schema: toOpenApiSchema(ChangeEmailSchema), required: true })
  @ApiResponse({ status: 200, description: 'Profile with the new email.', schema: toOpenApiSchema(PublicUserSchema) })
  @ApiResponse({ status: 400, description: 'Invalid email, wrong current password, or the same email as now.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'Another account already uses this email.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 429, description: 'Too many attempts, slow down.', schema: ERROR_SCHEMA })
  changeEmail(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(ChangeEmailSchema)) input: ChangeEmailInput,
  ): Promise<PublicUser> {
    return this.users.changeEmail(userId, input.email, input.currentPassword);
  }

  @Post('me/password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the password (current one required)' })
  @ApiBody({ schema: toOpenApiSchema(ChangePasswordSchema), required: true })
  @ApiResponse({ status: 204, description: 'Password changed. Sessions stay valid until their token expires.' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 429, description: 'Too many attempts, slow down.', schema: ERROR_SCHEMA })
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

  @Patch(':id/role')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Give or take away admin access — ADMIN only',
    description:
      'Never your own account (another admin has to) and never the last admin (409). Sending the current role is a no-op. Recorded in the audit log; the account gets an ACCOUNT_SECURITY notification. Takes effect on its open sessions at once (the role is read on every request).',
  })
  @ApiParam({ name: 'id', description: 'Account id' })
  @ApiBody({ schema: toOpenApiSchema(ChangeUserRoleSchema), required: true })
  @ApiResponse({ status: 200, description: 'The account with its new role.', schema: toOpenApiSchema(PublicUserSchema) })
  @ApiResponse({ status: 403, description: 'Signed in as USER — this route needs ADMIN.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No account with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'Your own account, or the last admin.', schema: ERROR_SCHEMA })
  changeRole(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ChangeUserRoleSchema)) input: ChangeUserRoleInput,
  ): Promise<PublicUser> {
    return this.adminUsers.changeRole(id, input.role, adminId);
  }
}
