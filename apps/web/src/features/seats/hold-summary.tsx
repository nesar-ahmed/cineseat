'use client';

import Link from 'next/link';
import type { Hold, SeatPrices, ShowSeat } from '@cineseat/shared';
import { ClockIcon, SeatIcon } from '../../components/ui/icons';
import { money } from '../catalog/format';
import { CATEGORY_LABEL } from './seat-grid';
import { clock } from './use-countdown';

export type SummaryProps = {
  /** Picked seats, front row first. */
  seats: ShowSeat[];
  total: number;
  maxSeats: number;
  holdMinutes: number;
  prices: SeatPrices;
  /** The buyer's hold on this show, while it lasts. */
  hold: Hold | null;
  secondsLeft: number | null;
  /** The picks differ from the seats on hold. */
  changed: boolean;
  signedIn: boolean;
  /** The show has started: nothing can be held any more. */
  closed: boolean;
  reserving: boolean;
  releasing: boolean;
  onReserve: () => void;
  onRelease: () => void;
};

type Action = {
  label: string;
  /** A page to go to (checkout) rather than something to do here. */
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
};

/** The one thing the buyer can do next, given where they are. */
function actionFor(props: SummaryProps): Action {
  const { seats, hold, changed, signedIn, closed, reserving } = props;
  if (closed) return { label: 'Booking closed', disabled: true };
  if (seats.length === 0) return { label: 'Pick your seats', disabled: true };
  if (!signedIn) return { label: 'Sign in to reserve', onClick: props.onReserve };
  if (hold && !changed) {
    return { label: 'Continue to checkout', href: `/checkout/${encodeURIComponent(hold.id)}` };
  }
  if (reserving) return { label: 'Reserving…', disabled: true };
  const count = `${seats.length} ${seats.length === 1 ? 'seat' : 'seats'}`;
  return { label: hold ? `Update to ${count}` : `Reserve ${count}`, onClick: props.onReserve };
}

function PrimaryButton({ action, className = '' }: { action: Action; className?: string }) {
  if (action.href) {
    return (
      <Link href={action.href} className={`btn-primary ${className}`}>
        <SeatIcon className="h-4 w-4" />
        {action.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={`btn-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${className}`}
    >
      <SeatIcon className="h-4 w-4" />
      {action.label}
    </button>
  );
}

/** Time left on the hold, as digits and a draining bar; amber in the last minute. */
function HoldTimer({ hold, secondsLeft }: { hold: Hold; secondsLeft: number }) {
  const duration = Math.max(1, (Date.parse(hold.expiresAt) - Date.parse(hold.createdAt)) / 1000);
  const urgent = secondsLeft <= 60;
  return (
    <div
      className={`rounded-2xl border p-4 ${urgent ? 'border-gold-400/50 bg-gold-400/10' : 'border-brand-500/40 bg-brand-500/10'}`}
    >
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold text-ink-50">
          <ClockIcon className={`h-4 w-4 ${urgent ? 'text-gold-300' : 'text-brand-300'}`} />
          Held for you
        </span>
        <span
          className={`font-display text-2xl font-semibold tabular-nums ${urgent ? 'text-gold-200' : 'text-ink-50'}`}
        >
          {clock(secondsLeft)}
        </span>
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-linear motion-reduce:transition-none ${urgent ? 'bg-gold-400' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, (secondsLeft / duration) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Nobody else can take these seats until the timer runs out.
      </p>
    </div>
  );
}

/** The side panel on wide screens. */
export function SummaryPanel(props: SummaryProps) {
  const { seats, total, maxSeats, holdMinutes, prices, hold, secondsLeft, changed } = props;
  const action = actionFor(props);
  return (
    <section aria-labelledby="summary-title" className="card rounded-3xl p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="summary-title" className="font-sans text-base font-semibold text-ink-50">
          Your seats
        </h2>
        <p className="text-xs tabular-nums text-ink-400">
          {seats.length} of {maxSeats}
        </p>
      </div>

      {seats.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-ink-400">
            Tap seats on the map to pick them — up to {maxSeats} in one booking.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[])
              .filter((category) => prices[category] !== undefined)
              .map((category) => (
                <div key={category} className="flex justify-between">
                  <dt className="text-ink-300">{CATEGORY_LABEL[category]}</dt>
                  <dd className="tabular-nums text-ink-100">{money(prices[category] ?? 0)}</dd>
                </div>
              ))}
          </dl>
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
            {seats.map((seat) => (
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
          <p className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-4">
            <span className="text-sm text-ink-300">Total</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-ink-50">
              {money(total)}
            </span>
          </p>
        </>
      )}

      {hold && secondsLeft !== null && !changed ? (
        <div className="mt-5">
          <HoldTimer hold={hold} secondsLeft={secondsLeft} />
        </div>
      ) : null}

      <PrimaryButton action={action} className="mt-5 w-full py-3.5" />

      {action.href ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Your seats stay held while you check out; paying adds a few more minutes.
        </p>
      ) : hold && changed && seats.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Your current seats stay held until you update.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Reserving holds your seats for {holdMinutes} minutes while you pay.
        </p>
      )}

      {hold ? (
        <button
          type="button"
          onClick={props.onRelease}
          disabled={props.releasing}
          className="mt-4 w-full text-center text-sm font-semibold text-ink-400 hover:text-ink-100 disabled:opacity-50"
        >
          {props.releasing ? 'Releasing…' : 'Release my seats'}
        </button>
      ) : null}
    </section>
  );
}

/** The same summary, pinned to the bottom of small screens. */
export function SummaryBar(props: SummaryProps) {
  const { seats, total, hold, secondsLeft, changed } = props;
  const action = actionFor(props);
  const urgent = secondsLeft !== null && secondsLeft <= 60;
  return (
    <div
      role="region"
      aria-label="Your seats"
      className="sticky bottom-0 z-40 mt-8 border-t border-white/10 bg-ink-950/90 backdrop-blur-xl lg:hidden"
    >
      <div className="container-x flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-50">
            {seats.length === 0
              ? 'No seats picked'
              : `${seats.map((seat) => seat.label).join(', ')} · ${money(total)}`}
          </p>
          {hold && secondsLeft !== null && !changed ? (
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-xs ${urgent ? 'text-gold-300' : 'text-ink-400'}`}
            >
              <ClockIcon className="h-3.5 w-3.5" />
              Held for <span className="tabular-nums">{clock(secondsLeft)}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={props.onRelease}
                disabled={props.releasing}
                className="font-semibold text-ink-300 underline-offset-2 hover:underline"
              >
                Release
              </button>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-400">
              Up to {props.maxSeats} seats · held {props.holdMinutes} min once reserved
            </p>
          )}
        </div>
        <PrimaryButton action={action} className="shrink-0 px-4" />
      </div>
    </div>
  );
}
