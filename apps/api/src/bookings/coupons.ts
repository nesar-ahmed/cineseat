/** A coupon row as checkout reads it. */
export type CouponRule = {
  id: string;
  code: string;
  description: string | null;
  /** PERCENT: `value` is a percentage; FLAT: `value` is minor units off. */
  type: string;
  value: number;
  validFrom: Date;
  validTo: Date;
  usageLimit: number | null;
  usedCount: number;
  minSeats: number | null;
  /** Comma-separated days of the week (0 = Sunday); null = any day. */
  weekdays: string | null;
  firstBookingOnly: boolean;
};

export type CouponContext = {
  now: Date;
  subtotal: number;
  seatCount: number;
  /** The show's calendar day in the cinemas' time zone (`YYYY-MM-DD`). */
  showDate: string;
  /** The buyer's confirmed bookings so far. */
  confirmedBookings: number;
};

export type CouponResult = { ok: true; discount: number } | { ok: false; reason: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Whether an offer code applies to this booking, and how much it takes off.
 * The reasons are written for the buyer. Discounts never exceed the subtotal.
 */
export function evaluateCoupon(
  coupon: CouponRule | undefined,
  code: string,
  context: CouponContext,
): CouponResult {
  if (!coupon) return { ok: false, reason: `There is no offer with the code ${code}.` };
  if (context.now < coupon.validFrom) return { ok: false, reason: 'This code is not active yet.' };
  if (context.now > coupon.validTo) return { ok: false, reason: 'This code has expired.' };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: 'This code has been fully redeemed.' };
  }
  if (coupon.minSeats !== null && context.seatCount < coupon.minSeats) {
    return {
      ok: false,
      reason: `This code needs at least ${coupon.minSeats} seats in one booking.`,
    };
  }
  const days = parseWeekdays(coupon.weekdays);
  if (days && !days.includes(weekdayOf(context.showDate))) {
    return { ok: false, reason: `This code is for shows on ${listDays(days)}.` };
  }
  if (coupon.firstBookingOnly && context.confirmedBookings > 0) {
    return { ok: false, reason: 'This code is for your first booking only.' };
  }

  const raw =
    coupon.type === 'PERCENT' ? Math.floor((context.subtotal * coupon.value) / 100) : coupon.value;
  return { ok: true, discount: Math.max(0, Math.min(raw, context.subtotal)) };
}

function parseWeekdays(value: string | null): number[] | null {
  if (!value) return null;
  const days = value
    .split(',')
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? days : null;
}

/** Day of the week of a calendar date (0 = Sunday), independent of any time zone. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Days in week order starting Monday, as words: "Friday, Saturday and Sunday". */
function listDays(days: number[]): string {
  const names = [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => DAY_NAMES[day]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
