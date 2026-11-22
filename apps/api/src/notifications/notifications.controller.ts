import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AnnouncementResultSchema,
  CreateAnnouncementSchema,
  NotificationCategory,
  NotificationCountsSchema,
  NotificationListQuerySchema,
  NotificationReadFilter,
  NotificationSchema,
  PaginatedNotificationsSchema,
  ReadAllNotificationsSchema,
  ReadAllResultSchema,
  UnreadCountQuerySchema,
  UnreadCountSchema,
  UpdateNotificationSchema,
  type AnnouncementResult,
  type CreateAnnouncementInput,
  type Notification,
  type NotificationCounts,
  type NotificationListQuery,
  type Paginated,
  type ReadAllNotificationsInput,
  type ReadAllResult,
  type UnreadCount,
  type UnreadCountQuery,
  type UpdateNotificationInput,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const CATEGORY_QUERY = {
  name: 'category',
  required: false,
  description: `One or more of ${NotificationCategory.options.join(', ')}, comma-separated.`,
  schema: { type: 'string', example: 'bookings,offers,account' },
} as const;

/**
 * The signed-in account's in-app notifications. The account always comes from
 * the verified token: nobody can list, read or remove someone else's (another
 * account's notification answers 404, exactly like a missing one). Admins get
 * their `ADMIN_*` notifications here too — they are simply theirs.
 */
@ApiTags('notifications')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Your notifications, newest first',
    description:
      'Filter with `status` (unread / read) and `category` — one or more of bookings, offers, account, admin, comma-separated. Each item links to what it is about through `bookingId`, `showId` or `couponCode`.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: NotificationReadFilter.options },
  })
  @ApiQuery(CATEGORY_QUERY)
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'One or more notification types, comma-separated.',
    schema: { type: 'string', example: 'ADMIN_SHOW_SOLD_OUT,ADMIN_SHOW_ALMOST_FULL' },
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({
    status: 200,
    description: 'A page of notifications.',
    schema: toOpenApiSchema(PaginatedNotificationsSchema),
  })
  @ApiResponse({ status: 400, description: 'Invalid filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  list(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(NotificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<Paginated<Notification>> {
    return this.notifications.list(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'How many are unread',
    description: 'Cheap enough to poll for a header badge. `category` narrows it like the list.',
  })
  @ApiQuery(CATEGORY_QUERY)
  @ApiResponse({
    status: 200,
    description: 'Unread count.',
    schema: toOpenApiSchema(UnreadCountSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  unreadCount(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(UnreadCountQuerySchema)) query: UnreadCountQuery,
  ): Promise<UnreadCount> {
    return this.notifications.unreadCount(userId, query.category);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Totals and unread, overall and per category (for the list filters)' })
  @ApiResponse({
    status: 200,
    description: 'Counts.',
    schema: toOpenApiSchema(NotificationCountsSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  counts(@CurrentUser('id') userId: string): Promise<NotificationCounts> {
    return this.notifications.counts(userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all as read',
    description: 'Every unread notification, or only those of `categories` when given.',
  })
  @ApiBody({ schema: toOpenApiSchema(ReadAllNotificationsSchema, 'input'), required: false })
  @ApiResponse({
    status: 200,
    description: 'How many were marked.',
    schema: toOpenApiSchema(ReadAllResultSchema),
  })
  @ApiResponse({ status: 400, description: 'Unknown category.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  readAll(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(ReadAllNotificationsSchema)) input: ReadAllNotificationsInput,
  ): Promise<ReadAllResult> {
    return this.notifications.readAll(userId, input.categories);
  }

  @Post('announcements')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Send an announcement — ADMIN only',
    description:
      'An ANNOUNCEMENT notification for every account in the audience (ALL, USERS or ADMINS). Recorded in the audit log.',
  })
  @ApiBody({ schema: toOpenApiSchema(CreateAnnouncementSchema, 'input'), required: true })
  @ApiResponse({
    status: 201,
    description: 'Sent; how many accounts received it.',
    schema: toOpenApiSchema(AnnouncementResultSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid title, message or audience.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  announce(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(CreateAnnouncementSchema)) input: CreateAnnouncementInput,
  ): Promise<AnnouncementResult> {
    return this.notifications.announce(adminId, input);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mark one as read or unread' })
  @ApiParam({ name: 'id', description: 'Notification id' })
  @ApiBody({ schema: toOpenApiSchema(UpdateNotificationSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'The notification.',
    schema: toOpenApiSchema(NotificationSchema),
  })
  @ApiResponse({
    status: 400,
    description: '`read` missing or not a boolean.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such notification of yours.', schema: ERROR_SCHEMA })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNotificationSchema)) input: UpdateNotificationInput,
  ): Promise<Notification> {
    return this.notifications.setRead(userId, id, input.read);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one' })
  @ApiParam({ name: 'id', description: 'Notification id' })
  @ApiResponse({ status: 204, description: 'Removed.' })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such notification of yours.', schema: ERROR_SCHEMA })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.notifications.remove(userId, id);
  }
}
