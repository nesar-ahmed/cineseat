'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdminHistoryEntry, AdminShowDetail, SeatMap } from '@cineseat/shared';
import {
  CalendarIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilmIcon,
  BuildingIcon,
  LockIcon,
  MoreIcon,
  PencilIcon,
  ReceiptIcon,
  SeatIcon,
  TicketIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { ApiClientError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { count } from '../dashboard/format';
import {
  ADMIN_ROUTES,
  adminBookingHref,
  adminBookingsHref,
  adminMovieHref,
  adminShowsHref,
  adminTheaterHref,
} from '../links';
import { useToast } from '../toaster';
import { OccupancyBar, PosterThumb, Tag } from '../ui/bits';
import { percent, plural, shortDateTime } from '../ui/format';
import { CATEGORY_NAME, HallMap, StateLegend, type SeatState } from '../ui/hall-map';
import {
  BackLink,
  Card,
  DetailSkeleton,
  Figure,
  HistoryCard,
  KeyValues,
  LoadError,
  MissingPage,
  fieldList,
} from '../ui/page-kit';
import { AvailabilityBadge, StateBadge, showName, showWhen } from './bits';
import { useAdminShow, useShowSeats } from './queries';
import { CancelShowDialog } from './show-actions';
import { ShowDialog } from './show-dialog';

/** `/admin/shows/:id` */
export function AdminShowDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const query = useAdminShow(user?.id, id);
  if (query.isPending) return <DetailSkeleton label="Loading the show" />;
  if (query.error instanceof ApiClientError && query.error.status === 404)
    return (
      <MissingPage
        icon={CalendarIcon}
        title="Show not found"
        backHref={ADMIN_ROUTES.shows}
        backLabel="Back to showtimes"
      />
    );
  if (query.isError)
    return (
      <LoadError what="show" message={query.error.message} onRetry={() => void query.refetch()} />
    );
  return <Detail show={query.data} />;
}

function Detail({ show }: { show: AdminShowDetail }) {
  const router = useRouter();
  const now = useNow(30_000);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { seats, constraints } = show;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(show.id);
      toast({ tone: 'info', message: 'Show id copied' });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select the id instead' });
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <BackLink href={ADMIN_ROUTES.shows}>Showtimes</BackLink>
      </div>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <PosterThumb movie={show.movie} className="w-24 rounded-xl shadow-lift sm:w-28" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={show.state} />
            <AvailabilityBadge availability={show.availability} />
            <Tag>{show.format}</Tag>
            <Tag>{show.language}</Tag>
            <Tag title="Certificate">{show.movie.certificate}</Tag>
          </div>
          <h1 className="mt-3 font-display text-3xl text-ink-50 sm:text-4xl">
            <Link href={adminMovieHref(show.movie.id)} className="hover:underline">
              {show.movie.title}
            </Link>
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-200">
            <ClockIcon className="h-4 w-4 shrink-0 text-ink-400" />
            {showWhen(show)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-400">
            <BuildingIcon className="h-4 w-4 shrink-0" />
            <Link
              href={adminTheaterHref(show.theater.id)}
              className="hover:text-ink-100 hover:underline"
            >
              {show.theater.name}
            </Link>
            · {show.screen.name} · {show.theater.city}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-primary py-2.5">
              <PencilIcon className="h-4 w-4" />
              Change
            </button>
            <button type="button" onClick={() => setCancelling(true)} className="btn-ghost py-2.5">
              <TrashIcon className="h-4 w-4" />
              Cancel show
            </button>
            <Menu
              label="More actions for this show"
              buttonClassName="btn-icon h-11 w-11"
              items={[
                { label: 'The movie', icon: FilmIcon, href: adminMovieHref(show.movie.id) },
                {
                  label: 'The theater',
                  icon: BuildingIcon,
                  href: adminTheaterHref(show.theater.id),
                },
                {
                  label: 'Bookings for this show',
                  icon: TicketIcon,
                  href: adminBookingsHref({ show: show.id }),
                },
                {
                  label: 'Other shows on this screen',
                  icon: CalendarIcon,
                  href: adminShowsHref({ screen: show.screen.id }),
                },
                {
                  label: 'Seat page on the site',
                  icon: ExternalLinkIcon,
                  href: `/shows/${encodeURIComponent(show.id)}/seats`,
                  external: true,
                },
                { label: 'Copy show id', icon: CopyIcon, onSelect: () => void copyId() },
              ]}
            >
              <MoreIcon className="h-4 w-4" />
            </Menu>
          </div>
          {!constraints.canEdit ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
              <LockIcon className="h-3.5 w-3.5" />
              {constraints.editBlockedReason}
            </p>
          ) : null}
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Figure
          icon={SeatIcon}
          label="Seats sold"
          value={`${percent(seats.sold, seats.total)}%`}
          note={`${count(seats.sold)} of ${count(seats.total)} · ${count(seats.available)} left`}
        />
        <Figure
          icon={ClockIcon}
          label="On hold now"
          value={count(seats.held)}
          note={`${plural(show.bookingCounts.pending, 'checkout')} in progress`}
        />
        <Figure
          icon={ReceiptIcon}
          label="Revenue"
          value={money(show.revenue)}
          note={
            seats.sold
              ? `${money(Math.round(show.revenue / seats.sold))} per seat sold`
              : 'Successful payments'
          }
        />
        <Figure
          icon={TicketIcon}
          label="Bookings"
          value={count(show.bookingCounts.confirmed)}
          note={
            show.bookingCounts.failed
              ? `Paid · ${count(show.bookingCounts.failed)} not completed`
              : 'Paid'
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <SeatMapCard show={show} />
          <Card title="Seats by category" subtitle="What each sells at, and how many went">
            <div className="overflow-x-auto border-t border-white/[0.05]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                      Category
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Price
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Sold
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      On hold
                    </th>
                    <th scope="col" className="w-40 px-5 py-2.5 font-medium sm:px-6">
                      Filled
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {show.seatsByCategory.map((row) => (
                    <tr key={row.category}>
                      <th scope="row" className="px-5 py-3 font-medium text-ink-100 sm:px-6">
                        {CATEGORY_NAME[row.category]}
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-200">
                        {money(row.price)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-100">
                        {row.sold}/{row.total}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-300">{row.held}</td>
                      <td className="px-5 py-3 sm:px-6">
                        <OccupancyBar sold={row.sold} held={row.held} capacity={row.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <RecentBookings show={show} />
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="What can change" icon={LockIcon}>
            <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05] text-sm">
              {[
                {
                  label: 'Time, format, language, price',
                  ok: constraints.canEdit,
                  reason: constraints.editBlockedReason,
                },
                {
                  label: 'Cancel the show',
                  ok: constraints.canDelete,
                  reason: constraints.deleteBlockedReason,
                },
              ].map((row) => (
                <li key={row.label} className="px-5 py-3 sm:px-6">
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-ink-200">{row.label}</span>
                    <span
                      className={`text-xs font-semibold ${row.ok ? 'text-emerald-300' : 'text-gold-300'}`}
                    >
                      {row.ok ? 'Allowed' : 'Locked'}
                    </span>
                  </p>
                  {row.reason ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">{row.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card
            title="Prices"
            subtitle={`Base ${money(show.basePrice)} · premium +৳100 · recliner +৳200`}
          >
            <KeyValues
              rows={show.seatsByCategory.map((row) => ({
                label: CATEGORY_NAME[row.category],
                value: <span className="tabular-nums">{money(row.price)}</span>,
              }))}
            />
          </Card>
          <HistoryCard
            entries={show.history}
            now={now}
            describe={describe}
            empty="No changes recorded yet. Scheduling, changes and price moves will show up here."
          />
        </aside>
      </div>

      <ShowDialog
        show={editing ? show : null}
        lockedReason={constraints.canEdit ? null : constraints.editBlockedReason}
        onClose={() => setEditing(false)}
      />
      <CancelShowDialog
        show={
          cancelling
            ? { id: show.id, name: showName(show), blockedReason: constraints.deleteBlockedReason }
            : null
        }
        onClose={() => setCancelling(false)}
        onCancelled={() => router.push(adminShowsHref({ theater: show.theater.id }))}
      />
    </div>
  );
}

/** The hall as it stands right now (refreshed every few seconds): sold, held, free. */
function SeatMapCard({ show }: { show: AdminShowDetail }) {
  const map = useShowSeats(show.id);
  const grid = map.data ? seatGrid(map.data) : null;
  return (
    <Card
      title="Seat map"
      subtitle={map.data ? 'Live — refreshes every 15 seconds' : 'Loading the seats…'}
      action={map.isFetching ? <span className="text-xs text-ink-500">Refreshing…</span> : null}
    >
      <div className="border-t border-white/[0.05] px-5 py-6 sm:px-6">
        {grid ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <HallMap
              rows={grid.rows}
              cols={grid.cols}
              categoryOf={grid.categoryOf}
              stateOf={grid.stateOf}
              label={`Seat map: ${grid.counts.sold} sold, ${grid.counts.held} on hold, ${grid.counts.free} available.`}
            />
            <StateLegend counts={grid.counts} />
          </div>
        ) : map.isError ? (
          <p className="text-sm text-ink-400">Couldn’t load the seat map: {map.error.message}</p>
        ) : (
          <span className="mx-auto block h-56 max-w-2xl animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none" />
        )}
      </div>
    </Card>
  );
}

function seatGrid(map: SeatMap) {
  const state = new Map<string, SeatState>();
  const category = new Map<number, SeatMap['seats'][number]['category']>();
  const counts: Record<SeatState, number> = { sold: 0, held: 0, free: 0 };
  for (const seat of map.seats) {
    const value: SeatState =
      seat.status === 'BOOKED' ? 'sold' : seat.status === 'HELD' ? 'held' : 'free';
    state.set(`${seat.row}:${seat.number}`, value);
    category.set(seat.row, seat.category);
    counts[value] += 1;
  }
  return {
    rows: map.rows,
    cols: map.cols,
    counts,
    categoryOf: (row: number) => category.get(row) ?? 'STANDARD',
    stateOf: (row: number, number: number) => state.get(`${row}:${number}`) ?? 'free',
  };
}

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'text-emerald-300',
  PENDING: 'text-gold-300',
  FAILED: 'text-ink-400',
  CANCELLED: 'text-ink-400',
};
const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Paid',
  PENDING: 'Paying',
  FAILED: 'Not completed',
  CANCELLED: 'Cancelled',
};

function RecentBookings({ show }: { show: AdminShowDetail }) {
  const bookings = show.recentBookings;
  return (
    <Card
      title="Latest bookings"
      action={
        bookings.length ? (
          <Link
            href={adminBookingsHref({ show: show.id })}
            className="text-sm font-semibold text-gold-300 hover:text-gold-200"
          >
            All bookings
          </Link>
        ) : null
      }
      subtitle={
        bookings.length
          ? `The ${bookings.length} most recent · ${plural(show.bookingCounts.confirmed, 'paid booking')} in all`
          : 'No bookings yet'
      }
    >
      {bookings.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-400 sm:px-6">
          Bookings appear here as soon as someone holds seats.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-white/[0.05]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-ink-400">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                  Buyer
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Seats
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-5 py-3 sm:px-6">
                    <Link
                      href={adminBookingHref(booking.id)}
                      className="block truncate font-medium text-ink-100 hover:underline"
                    >
                      {booking.buyer.name}
                    </Link>
                    <p className="truncate text-xs text-ink-400">
                      <span className="font-mono">{booking.code}</span> · {booking.buyer.email}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-200">
                    {booking.seats.join(', ') || '—'}
                  </td>
                  <td
                    className={`px-3 py-3 text-xs font-semibold ${STATUS_TONE[booking.status] ?? 'text-ink-300'}`}
                  >
                    {STATUS_LABEL[booking.status] ?? booking.status}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-100">
                    {money(booking.amount)}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-ink-400 sm:px-6">
                    {shortDateTime(booking.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  startsAt: 'time',
  format: 'format',
  language: 'language',
  basePrice: 'price',
};

function describe(entry: AdminHistoryEntry) {
  switch (entry.action) {
    case 'create':
      return 'Scheduled the show';
    case 'update':
      return (
        <>
          Changed <span className="text-ink-300">{fieldList(entry.fields, FIELD_LABEL)}</span>
        </>
      );
    case 'delete':
      return 'Cancelled the show';
    default:
      return entry.action;
  }
}
