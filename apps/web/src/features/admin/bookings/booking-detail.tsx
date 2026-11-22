'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { AdminBookingDetail } from '@cineseat/shared';
import {
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  CopyIcon,
  FilmIcon,
  MailIcon,
  MoreIcon,
  ReceiptIcon,
  TicketIcon,
  UserIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { ApiClientError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { count } from '../dashboard/format';
import {
  ADMIN_ROUTES,
  adminBookingsHref,
  adminMovieHref,
  adminPaymentsHref,
  adminShowHref,
  adminTheaterHref,
  adminUserHref,
} from '../links';
import { useToast } from '../toaster';
import { PosterThumb, Tag } from '../ui/bits';
import { clock12, plural, shortDate, shortDateTime, weekdayDate } from '../ui/format';
import { CATEGORY_NAME } from '../ui/hall-map';
import { BackLink, Card, DetailSkeleton, KeyValues, LoadError, MissingPage } from '../ui/page-kit';
import { BOOKING_STATE, BookingBadge, PaymentBadge, bookingState } from './bits';
import { useAdminBooking } from './queries';

/**
 * `/admin/bookings/:id` — `#payments` opens on the payment attempts (refund
 * notices link there), `#payment-<id>` on one attempt, highlighted (the
 * payments list links there).
 */
export function AdminBookingDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const query = useAdminBooking(user?.id, id);
  if (query.isPending) return <DetailSkeleton label="Loading the booking" poster={false} />;
  if (query.error instanceof ApiClientError && query.error.status === 404)
    return (
      <MissingPage
        icon={TicketIcon}
        title="Booking not found"
        backHref={ADMIN_ROUTES.bookings}
        backLabel="Back to bookings"
      />
    );
  if (query.isError)
    return (
      <LoadError
        what="booking"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return <Detail booking={query.data} />;
}

function Detail({ booking }: { booking: AdminBookingDetail }) {
  const pending = booking.status === 'PENDING';
  // A live hold counts down by the second; everything else by the minute.
  const now = useNow(pending ? 1_000 : 60_000);
  const { toast } = useToast();
  const state = bookingState(booking, now);
  const { show, buyer } = booking;

  // Links to `#payments` / `#payment-<id>` arrive before the page has content:
  // scroll once it does, and mark the attempt the link is about.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    const follow = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash !== 'payments' && !hash.startsWith('payment-')) return;
      setFocused(hash.startsWith('payment-') ? hash.slice('payment-'.length) : null);
      document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'info', message: `${what} copied` });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select it instead' });
    }
  };

  const live = booking.seats.filter((seat) => !seat.released);
  const screened = now !== null && Date.parse(show.startsAt) <= now;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <BackLink href={ADMIN_ROUTES.bookings}>Bookings</BackLink>
      </div>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Booking</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-mono text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            {booking.code}
            <button
              type="button"
              onClick={() => void copy(booking.code, 'Booking code')}
              aria-label="Copy booking code"
              className="btn-icon h-9 w-9"
            >
              <CopyIcon className="h-4 w-4" />
            </button>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-400">
            <BookingBadge state={state} />
            <span>
              Booked {shortDateTime(booking.createdAt)} by{' '}
              <Link
                href={adminUserHref(buyer.id)}
                className="font-medium text-ink-200 hover:text-ink-50 hover:underline"
              >
                {buyer.name}
              </Link>
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-400">{BOOKING_STATE[state].hint}</p>
          {state === 'PENDING' && booking.expiresAt && now !== null ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-400/10 px-3 py-1 text-sm font-semibold tabular-nums text-gold-200">
              <ClockIcon className="h-4 w-4" />
              Hold ends in {countdown(Date.parse(booking.expiresAt) - now)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={adminShowHref(show.id)} className="btn-ghost py-2.5">
            <CalendarIcon className="h-4 w-4" />
            Open the show
          </Link>
          <Menu
            label="More actions for this booking"
            buttonClassName="btn-icon h-11 w-11"
            items={[
              { label: 'The movie', icon: FilmIcon, href: adminMovieHref(show.movie.id) },
              { label: 'The theater', icon: BuildingIcon, href: adminTheaterHref(show.theater.id) },
              { label: 'The buyer’s account', icon: UserIcon, href: adminUserHref(buyer.id) },
              {
                label: 'This buyer’s bookings',
                icon: TicketIcon,
                href: adminBookingsHref({ user: buyer.id }),
              },
              {
                label: 'Other bookings for this show',
                icon: TicketIcon,
                href: adminBookingsHref({ show: show.id }),
              },
              'separator',
              {
                label: 'Copy booking id',
                icon: CopyIcon,
                onSelect: () => void copy(booking.id, 'Booking id'),
              },
            ]}
          >
            <MoreIcon className="h-4 w-4" />
          </Menu>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Tickets"
            subtitle={
              live.length
                ? plural(live.length, 'seat')
                : 'No seats any more — they went back on sale'
            }
            icon={TicketIcon}
          >
            <div className="border-t border-white/[0.05] px-5 py-4 sm:px-6">
              <div className="flex gap-4">
                <PosterThumb movie={show.movie} className="w-16" />
                <div className="min-w-0 text-sm">
                  <Link
                    href={adminMovieHref(show.movie.id)}
                    className="font-semibold text-ink-50 hover:underline"
                  >
                    {show.movie.title}
                  </Link>
                  <p className="mt-1 text-ink-200">
                    {weekdayDate(show.date)} · {clock12(show.time)}
                    {screened ? <span className="text-ink-500"> · screened</span> : null}
                  </p>
                  <p className="text-ink-400">
                    <Link
                      href={adminTheaterHref(show.theater.id)}
                      className="hover:text-ink-100 hover:underline"
                    >
                      {show.theater.name}
                    </Link>{' '}
                    · {show.screen.name} · {show.theater.city}
                  </p>
                  <p className="mt-1.5 flex gap-1">
                    <Tag>{show.format}</Tag>
                    <Tag>{show.language}</Tag>
                  </p>
                </div>
              </div>
            </div>
            <table className="w-full border-t border-white/[0.05] text-left text-sm">
              <thead className="text-xs text-ink-400">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                    Seat
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {booking.seats.map((seat) => (
                  <tr key={seat.label} className={seat.released ? 'text-ink-500' : ''}>
                    <th scope="row" className="px-5 py-2.5 font-mono font-semibold sm:px-6">
                      <span className={seat.released ? 'line-through' : 'text-ink-50'}>
                        {seat.label}
                      </span>
                      {seat.released ? (
                        <span className="ml-2 font-sans text-[11px] font-normal">released</span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2.5">{CATEGORY_NAME[seat.category]}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums sm:px-6">
                      {money(seat.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <section id="payments" className="scroll-mt-24">
            <Card
              title="Payments"
              icon={ReceiptIcon}
              subtitle={
                booking.payments.length
                  ? `${plural(booking.payments.length, 'attempt')}, newest first`
                  : 'No payment attempts yet'
              }
            >
              {booking.payments.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">
                  {state === 'PENDING'
                    ? 'The seats are held; the buyer has not started paying.'
                    : 'The hold ended before the buyer started paying.'}
                </p>
              ) : (
                <ol className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                  {booking.payments.map((payment, index) => (
                    <li
                      key={payment.id}
                      id={`payment-${payment.id}`}
                      aria-current={focused === payment.id ? 'true' : undefined}
                      className={`scroll-mt-24 px-5 py-4 last:rounded-b-2xl sm:px-6 ${
                        focused === payment.id
                          ? 'bg-gold-400/[0.06] shadow-[inset_3px_0_0] shadow-gold-400'
                          : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums text-ink-500">
                            #{booking.payments.length - index}
                          </span>
                          <PaymentBadge status={payment.status} />
                          <span className="text-sm text-ink-200">
                            {payment.method ?? 'Method not reported yet'}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums text-ink-50">
                          {money(payment.amount)}
                        </span>
                      </div>
                      {payment.failureReason ? (
                        <p className="mt-2 text-sm text-ink-300">{payment.failureReason}</p>
                      ) : null}
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-ink-400 sm:grid-cols-3">
                        <div>
                          <dt className="inline text-ink-500">Started </dt>
                          <dd className="inline">{shortDateTime(payment.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-ink-500">Settled </dt>
                          <dd className="inline">
                            {payment.completedAt ? shortDateTime(payment.completedAt) : 'Not yet'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="inline text-ink-500">{payment.provider} ref </dt>
                          <dd className="inline break-all font-mono">{payment.providerRef}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Money" icon={ReceiptIcon}>
            <KeyValues
              rows={[
                {
                  label: 'Seats',
                  value: <span className="tabular-nums">{money(booking.subtotal)}</span>,
                },
                ...(booking.coupon
                  ? [
                      {
                        label: `Offer ${booking.coupon.code}`,
                        value: (
                          <span className="tabular-nums text-gold-300">
                            −{money(booking.discount)}
                          </span>
                        ),
                      },
                    ]
                  : []),
                {
                  label: 'Total',
                  value: <span className="font-semibold tabular-nums">{money(booking.total)}</span>,
                },
                {
                  label: 'Paid',
                  value: (
                    <span className="tabular-nums text-emerald-300">{money(booking.paid)}</span>
                  ),
                },
                ...(booking.refunded
                  ? [
                      {
                        label: 'Refunded',
                        value: (
                          <span className="tabular-nums text-sky-300">
                            {money(booking.refunded)}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {booking.coupon?.description ? (
              <p className="border-t border-white/[0.05] px-5 py-3 text-xs text-ink-400 sm:px-6">
                {booking.coupon.description}
              </p>
            ) : null}
          </Card>

          <Card title="Buyer" icon={UserIcon}>
            <div className="border-t border-white/[0.05] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-bold text-ink-200"
                >
                  {buyer.name
                    .split(/\s+/)
                    .map((part) => part[0] ?? '')
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <Link
                    href={adminUserHref(buyer.id)}
                    className="block truncate font-semibold text-ink-50 hover:underline"
                  >
                    {buyer.name}
                  </Link>
                  <a
                    href={`mailto:${buyer.email}`}
                    className="flex items-center gap-1 truncate text-sm text-gold-300 hover:text-gold-200"
                  >
                    <MailIcon className="h-3.5 w-3.5 shrink-0" />
                    {buyer.email}
                  </a>
                </div>
              </div>
            </div>
            <KeyValues
              rows={[
                {
                  label: 'Phone',
                  value: buyer.phone ?? <span className="text-ink-500">Not given</span>,
                },
                { label: 'Member since', value: shortDate(buyer.since.slice(0, 10)) },
                {
                  label: 'Paid bookings',
                  value: <span className="tabular-nums">{count(buyer.paidBookings)}</span>,
                },
                {
                  label: 'Spent in all',
                  value: <span className="tabular-nums">{money(buyer.spent)}</span>,
                },
              ]}
            />
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.05] px-5 py-3 sm:px-6">
              <Link
                href={adminUserHref(buyer.id)}
                className="text-sm font-semibold text-gold-300 hover:text-gold-200"
              >
                Account
              </Link>
              <Link
                href={adminBookingsHref({ user: buyer.id })}
                className="text-sm font-semibold text-gold-300 hover:text-gold-200"
              >
                All their bookings
              </Link>
              <Link
                href={adminPaymentsHref({ user: buyer.id })}
                className="text-sm font-semibold text-gold-300 hover:text-gold-200"
              >
                Their payments
              </Link>
            </div>
          </Card>

          <Card title="Timeline" icon={ClockIcon}>
            <Timeline booking={booking} now={now} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

type Event = { at: string; label: ReactNode; tone: 'done' | 'good' | 'bad' | 'ahead' };

/** What happened to the booking, in order — from the booking and its payments. */
function Timeline({ booking, now }: { booking: AdminBookingDetail; now: number | null }) {
  const events: Event[] = [
    {
      at: booking.createdAt,
      label: `Seats held (${booking.seats.map((seat) => seat.label).join(', ')})`,
      tone: 'done',
    },
  ];
  for (const payment of [...booking.payments].reverse()) {
    events.push({
      at: payment.createdAt,
      label: `Payment of ${money(payment.amount)} started`,
      tone: 'done',
    });
    if (payment.completedAt) {
      events.push({
        at: payment.completedAt,
        label:
          payment.status === 'SUCCESS'
            ? `Paid${payment.method ? ` with ${payment.method}` : ''} — booking confirmed`
            : payment.status === 'REFUNDED'
              ? 'Money refunded'
              : 'Payment failed',
        tone: payment.status === 'SUCCESS' ? 'good' : 'bad',
      });
    }
  }
  if (booking.status === 'FAILED')
    events.push({ at: booking.updatedAt, label: 'Hold ended; seats back on sale', tone: 'bad' });
  if (booking.status === 'PENDING' && booking.expiresAt) {
    const lapsed = now !== null && Date.parse(booking.expiresAt) <= now;
    events.push({
      at: booking.expiresAt,
      label: lapsed ? 'Hold ended' : 'Hold ends',
      tone: lapsed ? 'bad' : 'ahead',
    });
  }
  if (booking.status === 'CONFIRMED') {
    const past = now !== null && Date.parse(booking.show.startsAt) <= now;
    events.push({
      at: booking.show.startsAt,
      label: past ? 'Show started' : 'Show starts',
      tone: past ? 'done' : 'ahead',
    });
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const dot: Record<Event['tone'], string> = {
    done: 'border-ink-400 bg-ink-900',
    good: 'border-emerald-400 bg-emerald-400/40',
    bad: 'border-brand-400 bg-brand-500/40',
    ahead: 'border-dashed border-ink-500 bg-transparent',
  };
  return (
    <ol className="border-t border-white/[0.05] px-5 py-4 sm:px-6">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
          {index < events.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[5px] top-4 w-px bg-white/10"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${dot[event.tone]}`}
          />
          <div className="min-w-0 text-sm">
            <p className={event.tone === 'ahead' ? 'text-ink-400' : 'text-ink-100'}>
              {event.label}
            </p>
            <p className="text-xs text-ink-500">{shortDateTime(event.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "4:07" from milliseconds (never below 0:00). */
function countdown(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
