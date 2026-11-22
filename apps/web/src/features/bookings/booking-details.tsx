'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { hasInvoice, type Booking } from '@cineseat/shared';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  ReceiptIcon,
  TicketIcon,
} from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { ACCOUNT_ROUTES, invoiceHref } from '../account/links';
import { PanelHeader } from '../account/panel-header';
import { CINEMA_TIME_ZONE, money } from '../catalog/format';
import { movieHref } from '../catalog/links';
import { CATEGORY_LABEL } from '../seats/seat-grid';
import { CalendarButton, CopyCodeButton, TicketPass } from './booking-ticket';
import { isNotFound, useBooking } from './queries';
import { seatLines, showWhen, ticketState, TONE_BADGE, type TicketState } from './ticket-state';

type Props = {
  bookingId: string;
  /** Arrived straight from a successful checkout (`?confirmed=1`). */
  justBooked: boolean;
};

/**
 * One booking in the user panel (`/account/bookings/:id`): the ticket as a pass
 * once paid, with its status, receipt and venue beside it; the way back to
 * checkout while the seats are held; or why it did not complete.
 */
export function BookingDetails(props: Props) {
  return useHydrated() ? <Details {...props} /> : <Skeleton />;
}

function Details({ bookingId, justBooked }: Props) {
  const query = useBooking(bookingId);
  const now = useNow(1000);
  // Say "You're booked!" once: a reload or a shared link shows the plain ticket.
  const [welcome] = useState(justBooked);
  useEffect(() => {
    if (justBooked) window.history.replaceState(null, '', window.location.pathname);
  }, [justBooked]);

  if (query.isPending) return <Skeleton />;
  if (!query.data) {
    const missing = isNotFound(query.error);
    return (
      <Frame>
        <div className="card mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl p-8 text-center">
          <h1 className="font-display text-2xl text-ink-50">
            {missing ? 'Booking not found' : 'Couldn’t load this booking'}
          </h1>
          <p className="text-sm text-ink-300">
            {missing
              ? 'It is not in your account. A hold that ran out before payment is removed.'
              : (query.error?.message ?? 'Please try again.')}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {missing ? null : (
              <button type="button" onClick={() => void query.refetch()} className="btn-primary">
                Try again
              </button>
            )}
            <Link href={ACCOUNT_ROUTES.tickets} className={missing ? 'btn-primary' : 'btn-ghost'}>
              My tickets
            </Link>
          </div>
        </div>
      </Frame>
    );
  }

  const booking = query.data;
  const state = ticketState(booking, now);
  const valid = booking.status === 'CONFIRMED';
  const celebrate = welcome && valid;

  return (
    <Frame booking={booking} state={state}>
      {celebrate ? (
        <p
          role="status"
          className="mb-6 flex items-center gap-2.5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
        >
          <CheckIcon className="h-4 w-4 shrink-0" />
          Payment complete — you’re booked for {booking.show.movie.title}.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {/* What needs attention comes before the pass on every screen size. */}
          {state.kind === 'awaiting' ? <HoldNotice booking={booking} now={now} /> : null}
          {!valid && state.kind !== 'awaiting' ? (
            <NotCompleted booking={booking} state={state} />
          ) : null}
          <TicketPass booking={booking} valid={valid} />
          <div className="hidden lg:block">
            <VenueCard booking={booking} />
          </div>
        </div>

        <aside className="flex flex-col gap-6" aria-label="Booking details">
          <StatusCard booking={booking} state={state} now={now} />
          <PaymentCard booking={booking} />
          {/* Beside the pass on desktop; here on phones, after the receipt. */}
          <div className="lg:hidden">
            <VenueCard booking={booking} />
          </div>
          <ActionsCard booking={booking} state={state} justBooked={celebrate} />
        </aside>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------- attention */

function HoldNotice({ booking, now }: { booking: Booking; now: number | null }) {
  const left = booking.expiresAt && now !== null ? Date.parse(booking.expiresAt) - now : null;
  return (
    <section
      aria-label="Awaiting payment"
      className="flex flex-col gap-4 rounded-3xl border border-gold-400/40 bg-gold-400/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p className="flex items-start gap-3 text-sm text-gold-100">
        <ClockIcon className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          Your seats are held until {clock(booking.expiresAt!)}
          {left !== null && left > 0 ? (
            <>
              {' '}
              — <span className="font-mono font-semibold tabular-nums">{countdown(left)}</span> left
            </>
          ) : null}
          . Finish paying to get your ticket.
        </span>
      </p>
      <Link
        href={`/checkout/${encodeURIComponent(booking.id)}`}
        className="btn-primary shrink-0 self-start sm:self-center"
      >
        Continue checkout
      </Link>
    </section>
  );
}

function NotCompleted({ booking, state }: { booking: Booking; state: TicketState }) {
  const refunded = booking.payment?.status === 'REFUNDED';
  const why =
    state.kind === 'hold-ended'
      ? 'The seat hold ended before payment, so these seats went back on sale.'
      : state.kind === 'cancelled'
        ? 'This booking was cancelled.'
        : (booking.payment?.failureReason ??
          'The seat hold ended before the payment went through.');
  return (
    <section
      aria-label="Why this booking did not complete"
      className="card flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p className="flex items-start gap-3 text-sm text-ink-200">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
        <span>
          {why}{' '}
          {refunded
            ? `The ${money(booking.payment!.amount)} paid was refunded in full.`
            : 'You were not charged.'}
        </span>
      </p>
      <Link
        href={`/shows/${encodeURIComponent(booking.show.id)}/seats`}
        className="btn-primary shrink-0 self-start sm:self-center"
      >
        Pick seats again
      </Link>
    </section>
  );
}

/* ----------------------------------------------------------------- aside */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card rounded-3xl p-5 sm:p-6">
      <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.16em] text-ink-300">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

type Step = { label: string; at?: string; state: 'done' | 'current' | 'next' | 'failed' };

/** Reserved → paid → showtime, as far as this booking got. */
function StatusCard({
  booking,
  state,
  now,
}: {
  booking: Booking;
  state: TicketState;
  now: number | null;
}) {
  const payment = booking.payment;
  const steps: Step[] = [{ label: 'Seats reserved', at: stamp(booking.createdAt), state: 'done' }];

  if (booking.status === 'CONFIRMED') {
    steps.push({
      label: 'Paid',
      at: payment?.completedAt ? stamp(payment.completedAt) : undefined,
      state: 'done',
    });
    const screened = state.kind === 'screened';
    steps.push({
      label: screened ? 'Screened' : 'Showtime',
      at: showWhen(booking),
      state: screened ? 'done' : state.kind === 'today' ? 'current' : 'next',
    });
  } else if (state.kind === 'awaiting') {
    steps.push({ label: 'Waiting for payment', state: 'current' });
    steps.push({ label: 'Showtime', at: showWhen(booking), state: 'next' });
  } else if (state.kind === 'refunded') {
    steps.push({
      label: 'Payment refunded',
      at: payment?.completedAt ? stamp(payment.completedAt) : undefined,
      state: 'failed',
    });
  } else {
    steps.push({ label: state.label, state: 'failed' });
  }

  const soon =
    state.kind === 'today' && now !== null
      ? Math.round((Date.parse(booking.show.startsAt) - now) / 60_000)
      : null;

  return (
    <Card title="Status">
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${TONE_BADGE[state.tone]}`}
        >
          {state.label}
        </span>
        {soon !== null && soon > 0 ? (
          <span className="text-sm font-semibold text-gold-200">
            Starts in {soon >= 60 ? `${Math.floor(soon / 60)}h ` : ''}
            {soon % 60}m
          </span>
        ) : null}
      </p>
      <ol className="mt-5">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px ${
                  step.state === 'done' ? 'bg-emerald-400/40' : 'bg-white/10'
                }`}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative mt-0.5 inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border ${
                step.state === 'done'
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
                  : step.state === 'current'
                    ? 'border-gold-400/70 bg-gold-400/20'
                    : step.state === 'failed'
                      ? 'border-white/20 bg-white/[0.06]'
                      : 'border-white/15'
              }`}
            >
              {step.state === 'done' ? <CheckIcon className="h-3 w-3" /> : null}
              {step.state === 'current' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
              ) : null}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-semibold ${
                  step.state === 'next' ? 'text-ink-300' : 'text-ink-50'
                }`}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === 'done'
                    ? ' (done)'
                    : step.state === 'current'
                      ? ' (now)'
                      : step.state === 'failed'
                        ? ''
                        : ' (to come)'}
                </span>
              </span>
              {step.at ? <span className="block text-xs text-ink-400">{step.at}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The receipt: seats by category, the offer, the total and how it was paid. */
function PaymentCard({ booking }: { booking: Booking }) {
  const payment = booking.payment;
  const paid = payment?.status === 'SUCCESS';
  const refunded = payment?.status === 'REFUNDED';
  return (
    <Card title="Payment">
      <dl className="space-y-2.5 text-sm">
        {seatLines(booking).map((line) => (
          <Row
            key={line.category}
            label={`${line.count} × ${CATEGORY_LABEL[line.category]}`}
            hint={line.labels.join(', ')}
            value={money(line.total)}
          />
        ))}
        {booking.discount > 0 ? (
          <Row
            label={`Offer ${booking.coupon?.code ?? ''}`.trim()}
            hint={booking.coupon?.description ?? undefined}
            value={`−${money(booking.discount)}`}
            tone="text-emerald-300"
          />
        ) : null}
        <div className="!mt-4 border-t border-white/[0.08] pt-4">
          <Row
            label={paid ? 'Total paid' : booking.status === 'PENDING' ? 'Total due' : 'Total'}
            value={money(booking.total)}
            strong
          />
        </div>
        {paid && payment?.method ? <Row label="Paid with" value={payment.method} /> : null}
        {paid && payment?.completedAt ? (
          <Row label="Paid on" value={stamp(payment.completedAt)} />
        ) : null}
        {refunded ? (
          <Row label="Refunded" value={money(payment!.amount)} tone="text-emerald-300" />
        ) : null}
      </dl>
      {/* Same rule as the API: an invoice exists once money reached the booking. */}
      {hasInvoice(booking) ? (
        <Link
          href={invoiceHref(booking.id)}
          className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-ink-100 transition hover:border-white/25 motion-reduce:transition-none"
        >
          <span className="flex items-center gap-2.5">
            <ReceiptIcon className="h-4 w-4 text-brand-300" />
            View invoice
          </span>
          <ArrowRightIcon className="h-4 w-4 text-ink-400" />
        </Link>
      ) : null}
    </Card>
  );
}

function VenueCard({ booking }: { booking: Booking }) {
  const { theater, screen } = booking.show;
  const place = `${theater.name}, ${theater.address}, ${theater.city}`;
  return (
    <Card title="Venue">
      <p className="font-semibold text-ink-50">{theater.name}</p>
      <p className="mt-0.5 text-sm text-ink-300">{screen.name}</p>
      <p className="mt-3 flex items-start gap-2 text-sm text-ink-300">
        <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        <span>
          {theater.address}, {theater.city}
        </span>
      </p>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 hover:text-brand-200"
      >
        Get directions
        <ArrowRightIcon className="h-3.5 w-3.5" />
        <span className="sr-only"> (opens Google Maps in a new tab)</span>
      </a>
    </Card>
  );
}

function ActionsCard({
  booking,
  state,
  justBooked,
}: {
  booking: Booking;
  state: TicketState;
  justBooked: boolean;
}) {
  const upcoming = state.kind === 'upcoming' || state.kind === 'today';
  return (
    <section aria-label="Actions" className="flex flex-col gap-3">
      {upcoming ? (
        <>
          <CalendarButton booking={booking} />
          <CopyCodeButton code={booking.code} label />
        </>
      ) : null}
      {/* Mid-checkout, "book again" would only compete with finishing this one. */}
      {state.kind !== 'awaiting' ? (
        <Link href={movieHref(booking.show.movie.id)} className="btn-ghost w-full">
          <TicketIcon className="h-4 w-4" />
          {justBooked ? 'Book another show' : `Book ${booking.show.movie.title} again`}
        </Link>
      ) : null}
      <Link
        href={ACCOUNT_ROUTES.tickets}
        className="rounded-full py-2 text-center text-sm font-semibold text-ink-300 hover:text-ink-50"
      >
        All my tickets
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ frame */

function Frame({
  booking,
  state,
  children,
}: {
  booking?: Booking;
  state?: TicketState;
  children: ReactNode;
}) {
  return (
    <div className="container-x py-8 sm:py-12">
      {booking && state ? (
        <div className="mb-6 sm:mb-8">
          <PanelHeader
            trail={[
              { label: 'My account', href: ACCOUNT_ROUTES.overview },
              { label: 'My tickets', href: ACCOUNT_ROUTES.tickets },
              { label: booking.code, mono: true },
            ]}
            eyebrow={booking.status === 'CONFIRMED' ? 'Your ticket' : 'Booking details'}
            title={booking.show.movie.title}
            description={`${showWhen(booking)} · ${booking.show.theater.name}`}
          />
        </div>
      ) : (
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-400">
          <Link href={ACCOUNT_ROUTES.tickets} className="hover:text-ink-100">
            ← My tickets
          </Link>
        </nav>
      )}
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  strong = false,
  tone = '',
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className={`flex justify-between gap-4 ${tone}`}>
      <dt className={tone ? '' : strong ? 'font-semibold text-ink-50' : 'text-ink-300'}>
        {label}
        {hint ? <span className="block text-xs font-normal text-ink-500">{hint}</span> : null}
      </dt>
      <dd
        className={`text-right tabular-nums ${strong ? 'font-display text-lg font-semibold text-ink-50' : tone ? '' : 'text-ink-100'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="container-x py-8 sm:py-12">
      <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading your booking</span>
        <div aria-hidden="true" className="space-y-3">
          <div className="h-4 w-56 rounded bg-white/[0.06]" />
          <div className="h-10 w-72 max-w-full rounded-xl bg-white/[0.06]" />
        </div>
        <div
          aria-hidden="true"
          className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <div className="card h-[30rem] rounded-[28px]" />
          <div className="space-y-6">
            <div className="card h-48 rounded-3xl" />
            <div className="card h-56 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

/** "Tue, 10 Nov · 7:49 PM" on the cinemas' clock, like every other time on the site. */
function stamp(iso: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
  return `${day} · ${clock(iso)}`;
}

/** "7:49 PM" on the cinemas' clock. */
function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CINEMA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
