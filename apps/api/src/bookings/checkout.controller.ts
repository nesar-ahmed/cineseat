import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CheckoutInputSchema,
  CheckoutQuoteSchema,
  PaymentSessionSchema,
  type CheckoutInput,
  type CheckoutQuote,
  type PaymentSession,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CheckoutService } from './checkout.service';

/** Trying offer codes and opening payments: human-paced, not scripted. */
const CHECKOUT_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/** The answers every checkout step can give about the hold itself. */
const HoldErrors = () =>
  applyDecorators(
    ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA }),
    ApiResponse({
      status: 404,
      description: 'No hold with this id (or not yours).',
      schema: ERROR_SCHEMA,
    }),
    ApiResponse({
      status: 409,
      description: 'Already paid, or the show has started.',
      schema: ERROR_SCHEMA,
    }),
    ApiResponse({
      status: 410,
      description: 'The hold has ended; pick seats again.',
      schema: ERROR_SCHEMA,
    }),
  );

@ApiTags('checkout')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post(':holdId/quote')
  @HttpCode(HttpStatus.OK)
  @Throttle(CHECKOUT_THROTTLE)
  @ApiOperation({
    summary: 'Price your held seats, optionally with an offer code',
    description:
      'Nothing changes: this is what paying now would cost. An offer code that does not apply is a 400 whose message says why (expired, weekend shows only, three seats or more, first booking only, …).',
  })
  @ApiParam({ name: 'holdId', description: 'Hold id (from POST /holds)' })
  @ApiBody({ schema: toOpenApiSchema(CheckoutInputSchema, 'input'), required: false })
  @ApiResponse({
    status: 200,
    description: 'The price.',
    schema: toOpenApiSchema(CheckoutQuoteSchema),
  })
  @ApiResponse({ status: 400, description: 'The offer code does not apply.', schema: ERROR_SCHEMA })
  @HoldErrors()
  quote(
    @CurrentUser('id') userId: string,
    @Param('holdId') holdId: string,
    @Body(new ZodValidationPipe(CheckoutInputSchema)) input: CheckoutInput,
  ): Promise<CheckoutQuote> {
    return this.checkout.quote(userId, holdId, input ?? {});
  }

  @Post(':holdId/pay')
  @Throttle(CHECKOUT_THROTTLE)
  @ApiOperation({
    summary: 'Start paying — with the mock gateway (test mode, no real money)',
    description:
      'Prices the hold again (with the offer code, if any), opens a payment with the test gateway and extends the hold by PAYMENT_WINDOW_MINUTES (once). Send the buyer to `redirectUrl`; the gateway reports the result to the API and the booking becomes CONFIRMED — poll GET /bookings/:id. Asking again while a payment is open returns the same payment.',
  })
  @ApiParam({ name: 'holdId', description: 'Hold id (from POST /holds)' })
  @ApiBody({ schema: toOpenApiSchema(CheckoutInputSchema, 'input'), required: false })
  @ApiResponse({
    status: 201,
    description: 'The payment, waiting at the gateway.',
    schema: toOpenApiSchema(PaymentSessionSchema),
  })
  @ApiResponse({ status: 400, description: 'The offer code does not apply.', schema: ERROR_SCHEMA })
  @HoldErrors()
  pay(
    @CurrentUser('id') userId: string,
    @Param('holdId') holdId: string,
    @Body(new ZodValidationPipe(CheckoutInputSchema)) input: CheckoutInput,
  ): Promise<PaymentSession> {
    return this.checkout.pay(userId, holdId, input ?? {});
  }
}
