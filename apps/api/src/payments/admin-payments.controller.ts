import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminPaymentListQuerySchema,
  AdminPaymentListSchema,
  AdminPaymentSort,
  PaymentChannel,
  PaymentStatus,
  SortOrder,
  type AdminPaymentList,
  type AdminPaymentListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries, listQuery } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminPaymentsService } from './admin-payments.service';

/**
 * Every payment attempt, for the admin panel. ADMIN only, read-only: payments
 * change only through the provider's webhook. A payment's whole story is on its
 * booking (GET /admin/bookings/:id).
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Payments for the admin panel — ADMIN only',
    description:
      'Every payment attempt with its booking, buyer and show: status, amount, how the buyer paid (`channel`, `method`), the provider’s reference and, for failures and refunds, the reason. `counts` gives attempts per status with every other filter applied (status tabs); `totals` is the money in what the filters select — collected, refunded, failed and still open.',
  })
  @ApiQueries(
    ApiQuery({
      name: 'search',
      required: false,
      description:
        'The provider’s reference, a booking code (`CS-…` or its start), the buyer’s name or email, or an exact payment or booking id.',
      schema: { type: 'string' },
    }),
    listQuery('status', 'Any of these payment statuses.', PaymentStatus.options),
    listQuery('channel', 'Paid by any of these (card, bKash, Nagad).', PaymentChannel.options),
    listQuery('user', 'Any of these buyers (account ids).'),
    ApiQuery({
      name: 'from',
      required: false,
      description: 'Started on or after this cinema day (YYYY-MM-DD).',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'to',
      required: false,
      description: 'Started on or before this cinema day (YYYY-MM-DD).',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'minAmount',
      required: false,
      description: 'Minor units (poisha), inclusive.',
      schema: { type: 'integer', minimum: 0 },
    }),
    ApiQuery({
      name: 'maxAmount',
      required: false,
      description: 'Minor units (poisha), inclusive.',
      schema: { type: 'integer', minimum: 0 },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      description: '`created` = started, `completed` = settled (open ones last), `amount`.',
      schema: { type: 'string', enum: AdminPaymentSort.options, default: 'created' },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      description: 'Defaults to `desc`.',
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
    description: 'A page of payment attempts.',
    schema: toOpenApiSchema(AdminPaymentListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminPaymentListQuerySchema)) query: AdminPaymentListQuery,
  ): Promise<AdminPaymentList> {
    return this.payments.list(query);
  }
}
