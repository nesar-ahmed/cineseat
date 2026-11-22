import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { verifyMockSignature } from './mock-signature';

/**
 * The payment provider CineSeat talks to — and the only one: a test gateway
 * (see `mock-gateway/`) that accepts test cards only and never moves money.
 * A real provider would implement the same three things: a session reference,
 * the page the buyer pays on, and verification of what it reports back.
 */
@Injectable()
export class MockPaymentProvider {
  readonly name = 'mock' as const;

  constructor(private readonly config: ConfigService) {}

  /** An unguessable reference for a new payment session (it is the only key to the pay page). */
  newReference(): string {
    return `mock_${randomBytes(18).toString('base64url')}`;
  }

  /** The gateway's hosted payment page, served by the web app. */
  paymentPageUrl(reference: string): string {
    return `${this.webOrigin}/pay/mock/${encodeURIComponent(reference)}`;
  }

  /** Where the gateway sends the buyer back once the payment is decided. */
  returnUrl(bookingId: string, reference: string): string {
    return `${this.webOrigin}/checkout/${encodeURIComponent(bookingId)}?payment=${encodeURIComponent(reference)}`;
  }

  /** True when a webhook was signed by the gateway over exactly these bytes, recently. */
  verifyWebhook(signature: string | undefined, body: Buffer | string, now: Date): boolean {
    return verifyMockSignature(
      this.config.getOrThrow<string>('mockPaymentSecret'),
      signature,
      body,
      now,
    );
  }

  private get webOrigin(): string {
    return this.config.getOrThrow<string>('webOrigin');
  }
}
