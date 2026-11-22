import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminBookingDetailSchema,
  AdminBookingListQuerySchema,
  AdminBookingListSchema,
  AdminBookingSort,
  BookingStatus,
  PaymentStatus,
  SortOrder,
  type AdminBookingDetail,
  type AdminBookingList,
  type AdminBookingListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries, listQuery } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminBookingsService } from './admin-bookings.service';

const day = (name: string, description: string) =>
  ApiQuery({ name, required: false, description, schema: { type: 'string', format: 'date' } });

/**
 * Every buyer's bookings, for the admin panel. ADMIN only, read-only: bookings
 * change through the booking flow (holds, checkout, payment webhooks).
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: AdminBookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Bookings for the admin panel — ADMIN only',
    description:
      'Every booking with its buyer, show, seats, total, money paid and refunded, and latest payment attempt. `counts` gives bookings per status with every other filter applied (status tabs); `totals` sums what the filters select.',
  })
  @ApiQueries(
    ApiQuery({
      name: 'search',
      required: false,
      description:
        'A booking code (`CS-8607F6A2`, or its first characters), the buyer’s name or email, the movie, or an exact booking id.',
      schema: { type: 'string' },
    }),
    listQuery('status', 'Any of these booking statuses.', BookingStatus.options),
    listQuery(
      'payment',
      'Has a payment in any of these states (REFUNDED: money went back).',
      PaymentStatus.options,
    ),
    listQuery('movie', 'Any of these movie ids.'),
    listQuery('theater', 'Any of these theater ids.'),
    listQuery('show', 'Any of these show ids.'),
    listQuery('user', 'Any of these buyers (account ids).'),
    listQuery('coupon', 'Used any of these offer codes.'),
    day('bookedFrom', 'Booked on or after this cinema day (YYYY-MM-DD).'),
    day('bookedTo', 'Booked on or before this cinema day (YYYY-MM-DD).'),
    day('showFrom', 'For a show on or after this cinema day (YYYY-MM-DD).'),
    day('showTo', 'For a show on or before this cinema day (YYYY-MM-DD).'),
    ApiQuery({
      name: 'sort',
      required: false,
      description: '`created` = when booked, `showtime` = when the show starts, `amount` = total.',
      schema: { type: 'string', enum: AdminBookingSort.options, default: 'created' },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      description: 'Defaults to `desc` (newest, latest, largest first).',
      schema: { type: 'string', enum: SortOrder.options },
    }),
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, default: 1 },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
  )
  @ApiResponse({
    status: 200,
    description: 'A page of bookings.',
    schema: toOpenApiSchema(AdminBookingListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminBookingListQuerySchema)) query: AdminBookingListQuery,
  ): Promise<AdminBookingList> {
    return this.bookings.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One booking for the admin panel — ADMIN only',
    description:
      'The booking with every seat it priced (released ones marked), its price and offer, the buyer (with their paid bookings and spend) and every payment attempt, newest first — provider reference, method, outcome and reason.',
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiResponse({
    status: 200,
    description: 'The booking.',
    schema: toOpenApiSchema(AdminBookingDetailSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No booking with this id.', schema: ERROR_SCHEMA })
  detail(@Param('id') id: string): Promise<AdminBookingDetail> {
    return this.bookings.detail(id);
  }
}
