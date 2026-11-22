'use client';

import type { Booking } from '@cineseat/shared';
import { ClockIcon, ShieldIcon } from '../../components/ui/icons';
import { money } from '../catalog/format';
import { CATEGORY_LABEL } from '../seats/seat-grid';
import { clock } from '../seats/use-countdown';

export type SummaryProps = {
  booking: Booking;
  subtotal: number;
  discount: number;
  total: number;
  code: string | null;
  secondsLeft: number | null;
  /** Seconds the hold lasts in all (for the bar). */
  holdSeconds: number;
  /** A new price is on its way (an offer code is being checked). */
  pricing: boolean;
  paying: boolean;
  onPay: () => void;
};

function PayButton({
  total,
  pricing,
  paying,
  onPay,
  className = '',
}: SummaryProps & { className?: string }) {
  return (
    <button
      type="button"
      onClick={onPay}
      disabled={pricing || paying}
      className={`btn-primary disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <ShieldIcon className="h-4 w-4" />
      {paying ? 'Opening payment…' : `Pay ${money(total)}`}
    </button>
  );
}

/** The hold's clock: amber in the last minute, with a bar that drains. */
export function HoldClock({
  secondsLeft,
  holdSeconds,
}: {
  secondsLeft: number;
  holdSeconds: number;
}) {
  const urgent = secondsLeft <= 60;
  return (
    <div
      className={`rounded-2xl border p-4 ${urgent ? 'border-gold-400/50 bg-gold-400/10' : 'border-white/10 bg-white/[0.03]'}`}
    >
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-ink-200">
          <ClockIcon className={`h-4 w-4 ${urgent ? 'text-gold-300' : 'text-brand-300'}`} />
          Seats held for
        </span>
        <span
          className={`font-display text-xl font-semibold tabular-nums ${urgent ? 'text-gold-200' : 'text-ink-50'}`}
        >
          {clock(secondsLeft)}
        </span>
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-linear motion-reduce:transition-none ${urgent ? 'bg-gold-400' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, (secondsLeft / Math.max(1, holdSeconds)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** The order on wide screens: every seat, the offer, the total, and the way to pay. */
export function SummaryPanel(props: SummaryProps) {
  const { booking, subtotal, discount, total, code, secondsLeft, holdSeconds, pricing } = props;
  return (
    <section aria-labelledby="order-title" className="card rounded-3xl p-6">
      <h2 id="order-title" className="font-sans text-base font-semibold text-ink-50">
        Order summary
      </h2>
      <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
        {booking.seats.map((seat) => (
          <li key={seat.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-3">
              <span className="inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-lg bg-white/[0.06] px-1.5 text-xs font-bold text-ink-50">
                {seat.label}
              </span>
              <span className="text-ink-300">{CATEGORY_LABEL[seat.category]}</span>
            </span>
            <span className="tabular-nums text-ink-100">{money(seat.price)}</span>
          </li>
        ))}
      </ul>
      <dl
        aria-busy={pricing}
        className={`mt-2 space-y-2 border-t border-white/10 pt-4 text-sm transition-opacity ${pricing ? 'opacity-60' : ''}`}
      >
        <div className="flex justify-between">
          <dt className="text-ink-300">Subtotal</dt>
          <dd className="tabular-nums text-ink-100">{money(subtotal)}</dd>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between text-emerald-300">
            <dt>Offer {code}</dt>
            <dd className="tabular-nums">−{money(discount)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between pt-1">
          <dt className="text-ink-300">Total</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums text-ink-50">
            {money(total)}
          </dd>
        </div>
      </dl>
      {secondsLeft !== null ? (
        <div className="mt-5">
          <HoldClock secondsLeft={secondsLeft} holdSeconds={holdSeconds} />
        </div>
      ) : null}
      <PayButton {...props} className="mt-5 w-full py-3.5" />
      <p className="mt-3 text-center text-xs leading-relaxed text-ink-400">
        Test mode: you pay on CineSeat Test Pay with a test card. No real money is charged.
      </p>
    </section>
  );
}

/** The same order, pinned to the bottom of small screens. */
export function SummaryBar(props: SummaryProps) {
  const { total, secondsLeft, booking } = props;
  const urgent = secondsLeft !== null && secondsLeft <= 60;
  return (
    <div
      role="region"
      aria-label="Order"
      className="sticky bottom-0 z-40 mt-8 border-t border-white/10 bg-ink-950/90 backdrop-blur-xl lg:hidden"
    >
      <div className="container-x flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-50">
            {booking.seats.map((seat) => seat.label).join(', ')} · {money(total)}
          </p>
          {secondsLeft !== null ? (
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-xs ${urgent ? 'text-gold-300' : 'text-ink-400'}`}
            >
              <ClockIcon className="h-3.5 w-3.5" /> Held for{' '}
              <span className="tabular-nums">{clock(secondsLeft)}</span>
            </p>
          ) : null}
        </div>
        <PayButton {...props} className="shrink-0 px-4" />
      </div>
    </div>
  );
}
