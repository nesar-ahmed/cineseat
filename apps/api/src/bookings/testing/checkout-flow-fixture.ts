import type { PaymentSession } from '@cineseat/shared';
import { Booking, Coupon, Payment, User } from '../../database/entities';
import { HoldsService } from '../../holds/holds.service';
import { MockGatewayService } from '../../mock-gateway/mock-gateway.service';
import type { MockWebhookSender } from '../../mock-gateway/mock-webhook.sender';
import type { MockEvent } from '../../payments/mock-event';
import { MockPaymentProvider } from '../../payments/mock-payment-provider';
import { signMockEvent } from '../../payments/mock-signature';
import { PaymentEventsService } from '../../payments/payment-events.service';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../../shows/testing/schedule-fixture';
import { CheckoutService } from '../checkout.service';

const MINUTE = 60_000;
/** `minutes` after the fixture's frozen clock. */
export const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
const SECRET = 'test-only-mock-payment-secret';
const card = (cardNumber: string) =>
  ({ method: 'CARD', cardNumber, expiry: '12/30', cvc: '123', name: 'Buyer' }) as const;
export const VISA_OK = card('4242424242424242');
export const DECLINED = card('4000000000000002');
export const BKASH_OK = { method: 'BKASH', wallet: '01712345678', otp: '123456' } as const;

export type BuyerName = 'alice' | 'bob' | 'carol' | 'dave';

export type CheckoutFlowFixture = ScheduleFixture & {
  holds: HoldsService;
  checkout: CheckoutService;
  gateway: MockGatewayService;
  events: PaymentEventsService;
  /** Account ids by buyer. */
  users: Record<BuyerName, string>;
  /** Booking (hold) ids by buyer. */
  bookings: Record<BuyerName, string>;
  /** The seat ids of the Saturday show for these labels. */
  seatIds: (labels: string[]) => Promise<string[]>;
  /** The payment reference of a checkout session. */
  refOf: (session: PaymentSession) => string;
  /** Delivers the gateway's latest webhook, signed, as it arrives at `when`. */
  deliver: (when: Date) => Promise<unknown>;
};

/**
 * The schedule fixture plus bookings made through the real flow (hold →
 * checkout → mock gateway → signed webhook) on its Saturday show (seats
 * A ৳400, B ৳500, C ৳600). Clock: 12:00 on 12 Nov 2026 in Dhaka.
 *
 *   alice  A1 A2     paid at once (at +1/+2)                 CONFIRMED · 1 SUCCESS
 *   bob    B1        declined (+3/+4), then paid (+5)          CONFIRMED · FAILED + SUCCESS
 *   carol  C1 C2 C3  FLAT100 offer, holding, unpaid (+40)      PENDING   · no payment
 *   dave   A4        paid (+6/+7) after his hold had ended     FAILED    · REFUNDED ৳400
 *   buyer  10 seats  the schedule fixture's booking for tonight, made the day before,
 *                    no payment
 */
export async function createCheckoutFlowFixture(): Promise<CheckoutFlowFixture> {
  const f = await createScheduleFixture();
  const repo = f.dataSource.getRepository.bind(f.dataSource);
  const provider = new MockPaymentProvider(f.config);
  const sent: MockEvent[] = [];
  const sender = { send: (event: MockEvent) => sent.push(event) } as unknown as MockWebhookSender;
  const holds = new HoldsService(f.lane, repo(Booking), f.config);
  const checkout = new CheckoutService(f.lane, provider, f.config);
  const events = new PaymentEventsService(f.lane, provider, f.config);
  const gateway = new MockGatewayService(repo(Payment), provider, sender, f.config);

  const seatIds = async (labels: string[]) => {
    const map = await f.shows.seatMap(f.ids.sat, NOW);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)!.id);
  };
  const refOf = (session: PaymentSession) =>
    decodeURIComponent(session.redirectUrl.split('/').pop()!);
  const deliver = (when: Date) => {
    const body = JSON.stringify(sent[sent.length - 1]);
    return events.handleMockWebhook(Buffer.from(body), signMockEvent(SECRET, body, when), when);
  };

  // The fixture's booking takes the database's clock; place it the day before, on the frozen one.
  await repo(Booking).update({ showId: f.ids.tonight }, { createdAt: at(-24 * 60) });

  const users = {} as Record<BuyerName, string>;
  for (const name of ['alice', 'bob', 'carol', 'dave'] as const) {
    users[name] = (
      await repo(User).save({
        email: `${name}@cineseat.dev`,
        name: name[0].toUpperCase() + name.slice(1),
        phone: name === 'alice' ? '01700000001' : null,
        passwordHash: 'x',
      })
    ).id;
  }
  await repo(Coupon).insert({
    code: 'FLAT100',
    description: '৳100 off 3 seats or more',
    type: 'FLAT',
    value: 10000,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: new Date('2027-01-01T00:00:00Z'),
    minSeats: 3,
  });
  const bookings = {} as Record<BuyerName, string>;

  // Alice pays at once.
  let hold = await holds.place(
    users.alice,
    { showId: f.ids.sat, seatIds: await seatIds(['A1', 'A2']) },
    at(1),
  );
  let session = await checkout.pay(users.alice, hold.id, {}, at(1));
  await gateway.pay(refOf(session), VISA_OK, at(2));
  await deliver(at(2));
  bookings.alice = hold.id;

  // Bob's card is declined; he pays again with another.
  hold = await holds.place(users.bob, { showId: f.ids.sat, seatIds: await seatIds(['B1']) }, at(3));
  session = await checkout.pay(users.bob, hold.id, {}, at(3));
  await gateway.pay(refOf(session), DECLINED, at(4));
  await deliver(at(4));
  session = await checkout.pay(users.bob, hold.id, {}, at(5));
  await gateway.pay(refOf(session), VISA_OK, at(5));
  await deliver(at(5));
  bookings.bob = hold.id;

  // Dave starts paying, his hold runs out, and the money arrives afterwards.
  hold = await holds.place(
    users.dave,
    { showId: f.ids.sat, seatIds: await seatIds(['A4']) },
    at(6),
  );
  session = await checkout.pay(users.dave, hold.id, {}, at(6));
  await gateway.pay(refOf(session), VISA_OK, at(7));
  await holds.releaseExpired(at(30));
  await deliver(at(31));
  bookings.dave = hold.id;

  // Carol holds three seats with an offer and has not paid yet.
  hold = await holds.place(
    users.carol,
    { showId: f.ids.sat, seatIds: await seatIds(['C1', 'C2', 'C3']) },
    at(40),
  );
  await checkout.quote(users.carol, hold.id, { couponCode: 'FLAT100' }, at(40));
  await repo(Booking).update(
    { id: hold.id },
    {
      couponId: (await repo(Coupon).findOneByOrFail({ code: 'FLAT100' })).id,
      totalAmount: 170000,
    },
  );
  bookings.carol = hold.id;

  return {
    ...f,
    holds,
    checkout,
    gateway,
    events,
    users,
    bookings,
    seatIds,
    refOf,
    deliver,
  };
}
