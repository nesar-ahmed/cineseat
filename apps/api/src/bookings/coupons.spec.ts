import { evaluateCoupon, type CouponContext, type CouponRule } from './coupons';

const NOW = new Date('2026-11-12T06:00:00Z');
const coupon = (rule: Partial<CouponRule> = {}): CouponRule => ({
  id: 'c1',
  code: 'TEST',
  description: null,
  type: 'PERCENT',
  value: 10,
  validFrom: new Date('2026-11-01T00:00:00Z'),
  validTo: new Date('2026-12-01T00:00:00Z'),
  usageLimit: null,
  usedCount: 0,
  minSeats: null,
  weekdays: null,
  firstBookingOnly: false,
  ...rule,
});
const context = (over: Partial<CouponContext> = {}): CouponContext => ({
  now: NOW,
  subtotal: 150_000,
  seatCount: 3,
  showDate: '2026-11-14', // a Saturday
  confirmedBookings: 0,
  ...over,
});

describe('evaluateCoupon', () => {
  it('takes a percentage or a flat amount off, never more than the subtotal', () => {
    expect(evaluateCoupon(coupon(), 'TEST', context())).toEqual({ ok: true, discount: 15_000 });
    expect(evaluateCoupon(coupon({ value: 15 }), 'TEST', context({ subtotal: 33_333 }))).toEqual({
      ok: true,
      discount: 4_999, // rounded down to the poisha
    });
    expect(
      evaluateCoupon(coupon({ type: 'FLAT', value: 10_000 }), 'TEST', context({ subtotal: 8_000 })),
    ).toEqual({ ok: true, discount: 8_000 });
  });

  it('says why a code does not apply', () => {
    const reason = (rule: Partial<CouponRule> | undefined, over: Partial<CouponContext> = {}) => {
      const result = evaluateCoupon(rule && coupon(rule), 'TEST', context(over));
      return result.ok ? 'ok' : result.reason;
    };
    expect(reason(undefined)).toBe('There is no offer with the code TEST.');
    expect(reason({ validFrom: new Date('2026-11-20T00:00:00Z') })).toBe(
      'This code is not active yet.',
    );
    expect(reason({ validTo: new Date('2026-11-10T00:00:00Z') })).toBe('This code has expired.');
    expect(reason({ usageLimit: 5, usedCount: 5 })).toBe('This code has been fully redeemed.');
    expect(reason({ minSeats: 3 }, { seatCount: 2 })).toBe(
      'This code needs at least 3 seats in one booking.',
    );
    expect(reason({ weekdays: '0,5,6' }, { showDate: '2026-11-12' })).toBe(
      'This code is for shows on Friday, Saturday and Sunday.',
    );
    expect(reason({ firstBookingOnly: true }, { confirmedBookings: 1 })).toBe(
      'This code is for your first booking only.',
    );
  });

  it('applies each rule when it is met', () => {
    const ok = (rule: Partial<CouponRule>, over: Partial<CouponContext> = {}) =>
      evaluateCoupon(coupon(rule), 'TEST', context(over)).ok;
    expect(ok({ minSeats: 3 })).toBe(true);
    expect(ok({ weekdays: '0,5,6' })).toBe(true); // Saturday
    expect(ok({ weekdays: '0,5,6' }, { showDate: '2026-11-15' })).toBe(true); // Sunday
    expect(ok({ firstBookingOnly: true })).toBe(true);
    expect(ok({ usageLimit: 5, usedCount: 4 })).toBe(true);
  });
});
