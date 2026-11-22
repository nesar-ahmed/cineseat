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
  BookingListQuerySchema,
  BookingSchema,
  BookingStatus,
  PaginatedBookingsSchema,
  type Booking,
  type BookingListQuery,
  type Paginated,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Your bookings, newest first' })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: BookingStatus.options },
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({
    status: 200,
    description: 'A page of bookings.',
    schema: toOpenApiSchema(PaginatedBookingsSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  list(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(BookingListQuerySchema)) query: BookingListQuery,
  ): Promise<Paginated<Booking>> {
    return this.bookings.list(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One of your bookings',
    description:
      'Checkout reads this to follow a payment: PENDING while the seats are held, CONFIRMED once the payment succeeded, FAILED if the hold ended first (late money is refunded). A hold that ran out without any payment attempt no longer exists (404).',
  })
  @ApiParam({ name: 'id', description: 'Booking (hold) id' })
  @ApiResponse({ status: 200, description: 'The booking.', schema: toOpenApiSchema(BookingSchema) })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No booking with this id (or not yours).',
    schema: ERROR_SCHEMA,
  })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<Booking> {
    return this.bookings.findOne(userId, id);
  }
}
