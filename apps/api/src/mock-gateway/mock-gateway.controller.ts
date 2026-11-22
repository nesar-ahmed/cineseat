import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  MOCK_TEST_CARDS,
  MOCK_WALLET_CODES,
  MockGatewaySessionSchema,
  MockPayInputSchema,
  MockPayResultSchema,
  type MockGatewaySession,
  type MockPayInput,
  type MockPayResult,
} from '@cineseat/shared';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MockGatewayService } from './mock-gateway.service';

const TEST_DATA = `Test cards: ${MOCK_TEST_CARDS.map((card) => `${card.number} (${card.label})`).join(', ')}; any future expiry, any CVC. Wallets (bKash, Nagad): any 01XXXXXXXXX number, code ${MOCK_WALLET_CODES.approve} approves, ${MOCK_WALLET_CODES.decline} declines.`;

/** Paying is one try per session: keep guessing and scripting out. */
const PAY_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/**
 * TEST MODE ONLY. The pages of a pretend payment provider: no sign-in (the
 * session reference is the key, as with a hosted checkout), no real money.
 */
@ApiTags('mock-gateway')
@Controller('mock-gateway/sessions')
export class MockGatewayController {
  constructor(private readonly gateway: MockGatewayService) {}

  @Get(':ref')
  @ApiOperation({ summary: 'A payment session, as the test gateway shows it' })
  @ApiParam({ name: 'ref', description: 'Payment session reference (from redirectUrl)' })
  @ApiResponse({
    status: 200,
    description: 'The session.',
    schema: toOpenApiSchema(MockGatewaySessionSchema),
  })
  @ApiResponse({ status: 404, description: 'No such session.', schema: ERROR_SCHEMA })
  session(@Param('ref') ref: string): Promise<MockGatewaySession> {
    return this.gateway.session(ref);
  }

  @Post(':ref/pay')
  @HttpCode(HttpStatus.OK)
  @Throttle(PAY_THROTTLE)
  @ApiOperation({
    summary: 'Pay with a test card or wallet — nothing is charged',
    description: `The test data decides the outcome; any other card number is refused. ${TEST_DATA} The result is reported to the API by signed webhook a moment later.`,
  })
  @ApiParam({ name: 'ref', description: 'Payment session reference' })
  @ApiBody({ schema: toOpenApiSchema(MockPayInputSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'Approved or declined.',
    schema: toOpenApiSchema(MockPayResultSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Not a test card, expired card, wrong code or invalid form.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'Already paid or cancelled.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 410,
    description: 'The session expired (the seat hold ended).',
    schema: ERROR_SCHEMA,
  })
  pay(
    @Param('ref') ref: string,
    @Body(new ZodValidationPipe(MockPayInputSchema)) input: MockPayInput,
  ): Promise<MockPayResult> {
    return this.gateway.pay(ref, input);
  }

  @Post(':ref/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Back out of the payment and return to CineSeat' })
  @ApiParam({ name: 'ref', description: 'Payment session reference' })
  @ApiResponse({
    status: 200,
    description: 'Cancelled.',
    schema: toOpenApiSchema(MockPayResultSchema),
  })
  @ApiResponse({ status: 404, description: 'No such session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'Already paid or cancelled.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 410, description: 'The session expired.', schema: ERROR_SCHEMA })
  cancel(@Param('ref') ref: string): Promise<MockPayResult> {
    return this.gateway.cancel(ref);
  }
}
