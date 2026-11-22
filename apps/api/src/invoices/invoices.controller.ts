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
  InvoiceListQuerySchema,
  InvoiceSchema,
  InvoiceStatus,
  PaginatedInvoicesSchema,
  type Invoice,
  type InvoiceListQuery,
  type InvoiceSummary,
  type Paginated,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

/**
 * The buyer's own invoices (guideline 13: authorise by ownership — the account
 * id always comes from the verified token, never from the request).
 */
@ApiTags('invoices')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @ApiOperation({
    summary: 'Your invoices, newest first',
    description:
      'One invoice per booking that money reached: PAID when a payment succeeded, REFUNDED when it arrived after the seat hold ended and went straight back. Bookings still waiting for payment have none.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: InvoiceStatus.options },
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({
    status: 200,
    description: 'A page of invoices.',
    schema: toOpenApiSchema(PaginatedInvoicesSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  list(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(InvoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<Paginated<InvoiceSummary>> {
    return this.invoices.list(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One invoice, in full',
    description:
      'By the id of the booking it bills, so the ticket page can link straight to it. Seller, buyer, charge lines by seat category, offer, totals, refunds and the payment it was settled by.',
  })
  @ApiParam({ name: 'id', description: 'Booking id (the invoice carries the same id)' })
  @ApiResponse({
    status: 200,
    description: 'The invoice.',
    schema: toOpenApiSchema(InvoiceSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No invoice with this id: not yours, or no money ever reached the booking.',
    schema: ERROR_SCHEMA,
  })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<Invoice> {
    return this.invoices.findOne(userId, id);
  }
}
