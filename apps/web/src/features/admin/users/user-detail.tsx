'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { AdminHistoryEntry, AdminUserDetail } from '@cineseat/shared';
import {
  BuildingIcon,
  CalendarIcon,
  CopyIcon,
  FilmIcon,
  HeartIcon,
  LockIcon,
  MailIcon,
  MoreIcon,
  ReceiptIcon,
  SeatIcon,
  ShieldIcon,
  TicketIcon,
  UserIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { ApiClientError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { exactTime, relativeTime } from '../../notifications/time';
import { BookingBadge, PaymentBadge, bookingState } from '../bookings/bits';
import { useAdminBookings } from '../bookings/queries';
import { cinemaDate, count } from '../dashboard/format';
import {
  ADMIN_ROUTES,
  adminBookingHref,
  adminBookingsHref,
  adminMovieHref,
  adminPaymentHref,
  adminPaymentsHref,
  adminTheaterHref,
} from '../links';
import { ChannelMark } from '../payments/bits';
import { useAdminPayments } from '../payments/queries';
import { useToast } from '../toaster';
import { PosterThumb, Tag } from '../ui/bits';
import { clock12, plural, shortDate, shortDateTime, weekdayDate } from '../ui/format';
import {
  BackLink,
  Card,
  DetailSkeleton,
  Figure,
  HistoryCard,
  KeyValues,
  LoadError,
  Missing,
  MissingPage,
} from '../ui/page-kit';
import { Avatar, ROLE_LABEL, RoleBadge } from './bits';
import { useAdminUser } from './queries';
import { RoleDialog, type RoleTarget } from './role-dialog';

/** Bookings and payments the page lists; the rest are a link away. */
const RECENT = 5;

/** `/admin/users/:id` */
export function AdminUserDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const query = useAdminUser(user?.id, id);
  if (query.isPending) return <DetailSkeleton label="Loading the account" poster={false} />;
  if (query.error instanceof ApiClientError && query.error.status === 404)
    return (
      <MissingPage
        icon={UserIcon}
        title="Account not found"
        backHref={ADMIN_ROUTES.users}
        backLabel="Back to users"
      />
    );
  if (query.isError)
    return (
      <LoadError
        what="account"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return <Detail account={query.data} />;
}

function Detail({ account }: { account: AdminUserDetail }) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { toast } = useToast();
  const [roleTarget, setRoleTarget] = useState<RoleTarget | null>(null);
  const self = account.id === user?.id;
  const { stats } = account;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'info', message: `${what} copied` });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select it instead' });
    }
  };
  const ago = (iso: string) => (
    <time dateTime={iso} title={exactTime(iso)}>
      {now ? relativeTime(iso, now) : shortDateTime(iso)}
    </time>
  );
  const openRole = () => setRoleTarget({ id: account.id, name: account.name, role: account.role });

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <BackLink href={ADMIN_ROUTES.users}>Users</BackLink>
      </div>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <Avatar user={account} className="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl" />
          <div className="min-w-0">
            <p className="section-label">{self ? 'Your account' : 'Account'}</p>
            <h1 className="mt-1 truncate font-display text-3xl text-ink-50 sm:text-4xl">
              {account.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-400">
              <RoleBadge role={account.role} />
              <a
                href={`mailto:${account.email}`}
                className="inline-flex min-w-0 items-center gap-1 truncate text-gold-300 hover:text-gold-200"
              >
                <MailIcon className="h-3.5 w-3.5 shrink-0" />
                {account.email}
              </a>
              <span>Joined {shortDate(cinemaDate(account.createdAt))}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={adminBookingsHref({ user: account.id })} className="btn-ghost py-2.5">
            <TicketIcon className="h-4 w-4" />
            Bookings
          </Link>
          <Menu
            label="More actions for this account"
            buttonClassName="btn-icon h-11 w-11"
            items={[
              {
                label: 'Their payments',
                icon: ReceiptIcon,
                href: adminPaymentsHref({ user: account.id }),
              },
              'separator',
              {
                label: account.role === 'ADMIN' ? 'Remove admin access' : 'Make admin',
                icon: ShieldIcon,
                danger: account.role === 'ADMIN',
                disabled: !account.constraints.canChangeRole,
                hint: account.constraints.roleLockedReason ?? undefined,
                onSelect: openRole,
              },
              'separator',
              {
                label: 'Copy email',
                icon: CopyIcon,
                onSelect: () => void copy(account.email, 'Email'),
              },
              {
                label: 'Copy account id',
                icon: CopyIcon,
                onSelect: () => void copy(account.id, 'Account id'),
              },
            ]}
          >
            <MoreIcon className="h-4 w-4" />
          </Menu>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Figure
          icon={TicketIcon}
          label="Paid bookings"
          value={count(stats.paidBookings)}
          note={
            stats.upcoming
              ? `${count(stats.upcoming)} for shows still to come`
              : stats.notCompleted
                ? `${plural(stats.notCompleted, 'booking')} not completed`
                : 'None for shows still to come'
          }
        />
        <Figure
          icon={SeatIcon}
          label="Tickets"
          value={count(stats.tickets)}
          note="Seats in paid bookings"
        />
        <Figure
          icon={ReceiptIcon}
          label="Spent"
          value={money(stats.spent)}
          note={stats.refunded ? `${money(stats.refunded)} refunded` : 'Nothing refunded'}
        />
        <Figure
          icon={CalendarIcon}
          label="Last booking"
          value={
            stats.lastBookingAt
              ? now !== null && now - Date.parse(stats.lastBookingAt) < 12 * 3_600_000
                ? relativeTime(stats.lastBookingAt, now)
                : shortDate(cinemaDate(stats.lastBookingAt))
              : 'Never'
          }
          note={
            stats.firstBookingAt
              ? `First on ${shortDate(cinemaDate(stats.firstBookingAt))}`
              : 'No paid booking yet'
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <RecentBookings account={account} now={now} />
          <RecentPayments account={account} ago={ago} />
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Admin access" icon={ShieldIcon}>
            <div className="border-t border-white/[0.05] px-5 py-4 text-sm sm:px-6">
              <p className="text-ink-200">
                {account.role === 'ADMIN'
                  ? 'Can use the admin panel: the catalog, showtimes, bookings, payments and accounts.'
                  : 'A customer: books tickets on the site; no admin panel.'}
              </p>
              {account.constraints.canChangeRole ? (
                <button type="button" onClick={openRole} className="btn-ghost mt-4 py-2">
                  <ShieldIcon className="h-4 w-4" />
                  {account.role === 'ADMIN' ? 'Remove admin access' : 'Make admin'}
                </button>
              ) : (
                <p className="mt-3 flex items-start gap-2 text-xs text-ink-400">
                  <LockIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                  {account.constraints.roleLockedReason}
                </p>
              )}
            </div>
          </Card>

          <Card title="Profile" icon={UserIcon}>
            <KeyValues
              rows={[
                { label: 'Phone', value: account.phone ?? <Missing>Not given</Missing> },
                {
                  label: 'Home city',
                  value: account.preferredCity ?? <Missing>Not chosen</Missing>,
                },
                {
                  label: 'Likes',
                  value: account.preferredGenres.length ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {account.preferredGenres.map((genre) => (
                        <Tag key={genre}>{genre}</Tag>
                      ))}
                    </span>
                  ) : (
                    <Missing>No genres chosen</Missing>
                  ),
                },
                { label: 'Member since', value: shortDateTime(account.createdAt) },
                { label: 'Profile updated', value: ago(account.updatedAt) },
              ]}
            />
          </Card>

          <Card title="Books most" subtitle="From their paid bookings" icon={HeartIcon}>
            {account.favourites.movies.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">Nothing booked yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 border-t border-white/[0.05] px-5 py-4 sm:px-6">
                <Favourites
                  icon={FilmIcon}
                  label="Movies"
                  items={account.favourites.movies.map((movie) => ({
                    id: movie.id,
                    name: movie.title,
                    href: adminMovieHref(movie.id),
                    bookings: movie.bookings,
                  }))}
                />
                <Favourites
                  icon={BuildingIcon}
                  label="Theaters"
                  items={account.favourites.theaters.map((theater) => ({
                    id: theater.id,
                    name: theater.name,
                    href: adminTheaterHref(theater.id),
                    bookings: theater.bookings,
                  }))}
                />
              </div>
            )}
          </Card>

          <HistoryCard
            entries={account.history}
            now={now}
            describe={describe}
            empty="No role changes on record."
          />
        </aside>
      </div>

      <RoleDialog
        account={roleTarget}
        lockedReason={account.constraints.roleLockedReason}
        onClose={() => setRoleTarget(null)}
      />
    </div>
  );
}

function Favourites({
  icon: IconComponent,
  label,
  items,
}: {
  icon: typeof FilmIcon;
  label: string;
  items: { id: string; name: string; href: string; bookings: number }[];
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <IconComponent className="h-3.5 w-3.5" />
        {label}
      </p>
      <ol className="mt-1.5 flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3">
            <Link href={item.href} className="truncate text-ink-100 hover:underline">
              {item.name}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-ink-400">
              {plural(item.bookings, 'booking')}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Their latest bookings, any status; the full list is the bookings page, filtered to them. */
function RecentBookings({ account, now }: { account: AdminUserDetail; now: number | null }) {
  const { user } = useAuth();
  const list = useAdminBookings(user?.id, { user: [account.id], pageSize: RECENT });
  const data = list.data;
  return (
    <Card
      title="Bookings"
      subtitle={data ? `${plural(data.total, 'booking')}, latest first` : 'Latest first'}
      icon={TicketIcon}
      action={
        data && data.total > 0 ? (
          <Link
            href={adminBookingsHref({ user: account.id })}
            className="text-sm font-semibold text-gold-300 hover:text-gold-200"
          >
            {data.total > RECENT ? `All ${count(data.total)}` : 'Open list'}
          </Link>
        ) : null
      }
    >
      {list.isPending ? (
        <Rows />
      ) : list.isError ? (
        <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">
          Couldn’t load their bookings: {list.error.message}
        </p>
      ) : data!.items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {data!.items.map((booking) => (
            <li
              key={booking.id}
              className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-6"
            >
              <PosterThumb movie={booking.show.movie} className="w-8" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate">
                  <Link
                    href={adminBookingHref(booking.id)}
                    className="font-mono text-xs font-semibold text-ink-300 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {booking.code}
                  </Link>{' '}
                  <span className="text-ink-100">· {booking.show.movie.title}</span>
                </p>
                <p className="truncate text-xs text-ink-400">
                  {weekdayDate(booking.show.date)}, {clock12(booking.show.time)} ·{' '}
                  {booking.show.theater.name} · {plural(booking.seats.length, 'seat')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums text-ink-50">
                  {money(booking.total)}
                </span>
                <BookingBadge state={bookingState(booking, now)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Their latest payment attempts; each opens on its booking's page. */
function RecentPayments({
  account,
  ago,
}: {
  account: AdminUserDetail;
  ago: (iso: string) => ReactNode;
}) {
  const { user } = useAuth();
  const list = useAdminPayments(user?.id, { user: [account.id], pageSize: RECENT });
  const data = list.data;
  return (
    <Card
      title="Payments"
      subtitle={
        data ? `${plural(data.total, 'attempt')} · ${money(data.totals.collected)} collected` : ' '
      }
      icon={ReceiptIcon}
      action={
        data && data.total > 0 ? (
          <Link
            href={adminPaymentsHref({ user: account.id })}
            className="text-sm font-semibold text-gold-300 hover:text-gold-200"
          >
            {data.total > RECENT ? `All ${count(data.total)}` : 'Open list'}
          </Link>
        ) : null
      }
    >
      {list.isPending ? (
        <Rows />
      ) : list.isError ? (
        <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">
          Couldn’t load their payments: {list.error.message}
        </p>
      ) : data!.items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">No payment attempts yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {data!.items.map((payment) => (
            <li
              key={payment.id}
              className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-6"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-2">
                  <Link
                    href={adminPaymentHref(payment.booking.id, payment.id)}
                    className="font-semibold tabular-nums text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {money(payment.amount)}
                  </Link>
                  <ChannelMark channel={payment.channel} />
                  <span className="truncate text-xs text-ink-400">
                    {payment.failureReason ?? payment.method ?? 'Not reported yet'}
                  </span>
                </p>
                <p className="truncate text-xs text-ink-500">
                  <span className="font-mono">{payment.booking.code}</span> ·{' '}
                  {payment.show.movie.title} · {ago(payment.createdAt)}
                </p>
              </div>
              <PaymentBadge status={payment.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Rows() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 border-t border-white/[0.05] p-5 sm:px-6">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-10 animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function describe(entry: AdminHistoryEntry) {
  switch (entry.action) {
    case 'role.admin':
      return `Made an ${ROLE_LABEL.ADMIN.toLowerCase()}`;
    case 'role.user':
      return 'Admin access removed';
    default:
      return entry.action;
  }
}
