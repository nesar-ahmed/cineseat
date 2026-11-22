import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MockEvent } from '../payments/mock-event';
import { MOCK_SIGNATURE_HEADER, signMockEvent } from '../payments/mock-signature';

/** Attempts for one event; the wait doubles each time (1 s, 2 s, 4 s …). */
const ATTEMPTS = 5;

/**
 * Delivers the gateway's events to the merchant (this API) over HTTP, signed,
 * after MOCK_WEBHOOK_DELAY_MS — the way a real provider confirms a payment
 * moments after the buyer pays. Network errors, 5xx, 408 and 429 are retried;
 * any other 4xx means the event was refused for good, so it is not.
 */
@Injectable()
export class MockWebhookSender {
  private readonly logger = new Logger('MockGateway');

  constructor(private readonly config: ConfigService) {}

  send(event: MockEvent): void {
    const body = JSON.stringify(event);
    this.later(
      () => this.deliver(event, body, 1),
      this.config.getOrThrow<number>('mockWebhookDelayMs'),
    );
  }

  private async deliver(event: MockEvent, body: string, attempt: number): Promise<void> {
    const url = this.config.getOrThrow<string>('mockWebhookUrl');
    let problem: string;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Signed at send time, so a retry carries a fresh timestamp.
          [MOCK_SIGNATURE_HEADER]: signMockEvent(
            this.config.getOrThrow<string>('mockPaymentSecret'),
            body,
          ),
        },
        body,
      });
      if (response.ok) return;
      problem = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 408 && response.status !== 429) {
        this.logger.error(`${event.type} for ${event.data.ref} refused (${problem}); not retrying`);
        return;
      }
    } catch (error) {
      problem = (error as Error).message;
    }
    if (attempt >= ATTEMPTS) {
      this.logger.error(
        `${event.type} for ${event.data.ref} undelivered after ${attempt} attempts (${problem})`,
      );
      return;
    }
    this.logger.warn(`${event.type} for ${event.data.ref}: ${problem}; retrying`);
    this.later(() => this.deliver(event, body, attempt + 1), 1000 * 2 ** (attempt - 1));
  }

  private later(task: () => Promise<void>, ms: number): void {
    // A pending delivery never keeps the process alive on shutdown.
    setTimeout(() => void task(), ms).unref();
  }
}
