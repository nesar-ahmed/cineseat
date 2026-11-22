import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import {
  CURRENCY,
  MOCK_TEST_CARDS,
  MOCK_WALLET_CODES,
  type MockGatewaySession,
  type MockPayInput,
  type MockPayResult,
} from '@cineseat/shared';
import { showTimeLabel } from '../common/time/zoned-time';
import { Payment } from '../database/entities';
import type { MockEvent } from '../payments/mock-event';
import { MockPaymentProvider } from '../payments/mock-payment-provider';
import { MockWebhookSender } from './mock-webhook.sender';

type Decision = { outcome: MockPayResult['status']; message: string; method: string };

const WALLET_LABEL = { BKASH: 'bKash', NAGAD: 'Nagad' } as const;

/**
 * The test payment gateway — CineSeat's stand-in for a real provider, which
 * never moves money. A payment session is the merchant's payment row, looked
 * up by its unguessable reference; the outcome comes only from the published
 * test cards and wallet codes (real card numbers are refused), and it is
 * reported to the merchant through a signed webhook, like a real provider.
 * Card numbers are never stored or logged: events carry "Visa •••• 4242".
 */
@Injectable()
export class MockGatewayService {
  /** Sessions already answered in this process, so a double submit cannot send two outcomes. */
  private readonly answered = new Map<string, number>();

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly provider: MockPaymentProvider,
    private readonly sender: MockWebhookSender,
    private readonly config: ConfigService,
  ) {}

  /** GET /mock-gateway/sessions/:ref — what the hosted payment page shows. */
  async session(ref: string, now: Date = new Date()): Promise<MockGatewaySession> {
    const payment = await this.payments.findOne({
      where: { providerRef: ref, provider: 'mock' },
      relations: { booking: { seats: true, show: { movie: true } } },
    });
    if (!payment) throw new NotFoundException('Payment session not found');
    const { booking } = payment;
    const expiresAt = booking.expiresAt ?? payment.createdAt;
    const timeZone = this.config.getOrThrow<string>('timeZone');
    const seats = booking.seats.filter((seat) => seat.releasedAt === null).length;
    return {
      ref,
      testMode: true,
      merchant: 'CineSeat',
      description: `${booking.show.movie.title} — ${seats} ${seats === 1 ? 'seat' : 'seats'}, ${showTimeLabel(booking.show.startsAt, timeZone)}`,
      amount: payment.amount,
      currency: CURRENCY,
      status:
        payment.status !== 'PENDING' || this.answered.has(ref)
          ? 'COMPLETED'
          : expiresAt <= now
            ? 'EXPIRED'
            : 'OPEN',
      expiresAt: expiresAt.toISOString(),
      returnUrl: this.provider.returnUrl(booking.id, ref),
    };
  }

  /** POST /mock-gateway/sessions/:ref/pay — the test card or wallet decides the outcome. */
  async pay(ref: string, input: MockPayInput, now: Date = new Date()): Promise<MockPayResult> {
    const session = await this.openSession(ref, now);
    const decision = input.method === 'CARD' ? decideCard(input, now) : decideWallet(input);
    return this.answer(session, decision, now);
  }

  /** POST /mock-gateway/sessions/:ref/cancel — the buyer backs out on the payment page. */
  async cancel(ref: string, now: Date = new Date()): Promise<MockPayResult> {
    const session = await this.openSession(ref, now);
    return this.answer(
      session,
      { outcome: 'FAILED', message: 'You cancelled the payment.', method: '' },
      now,
    );
  }

  private async openSession(ref: string, now: Date): Promise<MockGatewaySession> {
    const session = await this.session(ref, now);
    if (session.status === 'COMPLETED') {
      throw new ConflictException('This payment has already been completed.');
    }
    if (session.status === 'EXPIRED') {
      throw new GoneException(
        'This payment session has expired. Go back to CineSeat and try again.',
      );
    }
    return session;
  }

  private answer(session: MockGatewaySession, decision: Decision, now: Date): MockPayResult {
    this.remember(session.ref, now);
    const succeeded = decision.outcome === 'SUCCEEDED';
    const event: MockEvent = {
      id: `evt_${randomBytes(12).toString('hex')}`,
      type: succeeded ? 'payment.succeeded' : 'payment.failed',
      created: Math.floor(now.getTime() / 1000),
      data: {
        ref: session.ref,
        amount: session.amount,
        currency: session.currency,
        method: decision.method || null,
        reason: succeeded ? null : decision.message,
      },
    };
    this.sender.send(event);
    return { status: decision.outcome, message: decision.message, returnUrl: session.returnUrl };
  }

  private remember(ref: string, now: Date): void {
    // Keep an hour of answers; sessions never last that long.
    for (const [key, at] of this.answered) {
      if (now.getTime() - at > 3_600_000) this.answered.delete(key);
    }
    this.answered.set(ref, now.getTime());
  }
}

function decideCard(input: Extract<MockPayInput, { method: 'CARD' }>, now: Date): Decision {
  const card = MOCK_TEST_CARDS.find((test) => test.number === input.cardNumber);
  if (!card) {
    throw new BadRequestException(
      'cardNumber: This is a test gateway: use one of the test cards. Real cards are never charged.',
    );
  }
  const [month, year] = input.expiry.split('/').map(Number);
  // A card is good until the end of its expiry month.
  if (new Date(Date.UTC(2000 + year, month, 1)) <= now) {
    throw new BadRequestException('expiry: This card has expired.');
  }
  const method = `${card.brand} •••• ${card.number.slice(-4)}`;
  return card.outcome === 'SUCCEEDED'
    ? { outcome: 'SUCCEEDED', message: 'Payment approved.', method }
    : { outcome: 'FAILED', message: card.message, method };
}

function decideWallet(input: Extract<MockPayInput, { method: 'BKASH' | 'NAGAD' }>): Decision {
  const method = `${WALLET_LABEL[input.method]} ${input.wallet.slice(0, 3)}•••••${input.wallet.slice(-3)}`;
  if (input.otp === MOCK_WALLET_CODES.approve) {
    return { outcome: 'SUCCEEDED', message: 'Payment approved.', method };
  }
  if (input.otp === MOCK_WALLET_CODES.decline) {
    return { outcome: 'FAILED', message: 'The payment was declined in the wallet app.', method };
  }
  throw new BadRequestException(
    `otp: Wrong code. In test mode, ${MOCK_WALLET_CODES.approve} approves and ${MOCK_WALLET_CODES.decline} declines.`,
  );
}
