import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ERROR_SCHEMA } from '../common/docs/openapi';
import { MOCK_SIGNATURE_HEADER } from './mock-signature';
import { PaymentEventsService, type EventOutcome } from './payment-events.service';

@ApiTags('payments')
// Every event comes from the provider's few addresses; rate limiting them would
// drop payment results. The signature check is the gate here, not the throttle.
@SkipThrottle()
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly events: PaymentEventsService) {}

  @Post('webhook/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment results from the mock gateway (server to server)',
    description:
      'Called by the test gateway, never by browsers. The body is verified against its HMAC signature (over the exact bytes, with a timestamp to stop replays) before anything is read. Each payment settles once; repeated events are acknowledged and ignored.',
  })
  @ApiHeader({
    name: MOCK_SIGNATURE_HEADER,
    description: '`t=<unix seconds>,v1=<hex HMAC-SHA256>`',
  })
  @ApiResponse({ status: 200, description: 'Applied (or already applied).' })
  @ApiResponse({
    status: 400,
    description: 'Bad signature, malformed event or wrong amount.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'No payment with this reference.',
    schema: ERROR_SCHEMA,
  })
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers(MOCK_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ received: true; outcome: EventOutcome }> {
    return this.events.handleMockWebhook(request.rawBody, signature);
  }
}
