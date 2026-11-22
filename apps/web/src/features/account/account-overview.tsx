'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PublicUser } from '@cineseat/shared';
import { ClockIcon, PencilIcon } from '../../components/ui/icons';
import { useNow } from '../../hooks/use-now';
import { assetUrl } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';
import { useBookingCount } from '../bookings/queries';
import { AccountShortcuts, SettingsCard } from './account-shortcuts';
import { ACCOUNT_ROUTES } from './links';
import { RecentBookings } from './recent-bookings';

/**
 * The user panel's home (`/account`): who you are, what needs doing, and a way
 * into every part of the panel — tickets, invoices, notifications and settings.
 * Everything shown comes from the API (GET /auth/me, GET /bookings); nothing is
 * counted that the API cannot count.
 */
export function AccountOverview() {
  const { user, status } = useAuth();

  if (status === 'loading') return <OverviewSkeleton />;
  // The route guard only checks that the cookie exists; an expired one lands here.
  if (!user) return <SessionEnded />;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ProfileHero user={user} />
      <PendingPayment />
      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
          <AccountShortcuts />
          <RecentBookings />
        </div>
        <aside
          className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start"
          aria-label="Account settings"
        >
          <SettingsCard user={user} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function ProfileHero({ user }: { user: PublicUser }) {
  const confirmed = useBookingCount('CONFIRMED');
  const pending = useBookingCount('PENDING');
  const profile = profileCompleteness(user);

  return (
    <section
      aria-labelledby="account-title"
      className="card grain relative overflow-hidden rounded-[28px]"
    >
      {/* A soft projector glow behind the avatar; purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="section-label">My account</p>
          <h1
            id="account-title"
            className="mt-2 break-words text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl"
          >
            {greeting()}, {firstName(user.name)}
          </h1>
          <p className="mt-2 break-all text-sm text-ink-300">{user.email}</p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="About your account">
            <li className="chip">Member since {memberSince(user.createdAt)}</li>
            {user.preferredCity ? <li className="chip">{user.preferredCity}</li> : null}
            {user.role === 'ADMIN' ? (
              <li className="chip border-gold-500/40 text-gold-300">Admin</li>
            ) : null}
          </ul>
        </div>
        <Link href={ACCOUNT_ROUTES.profile} className="btn-ghost self-start sm:self-center">
          <PencilIcon className="h-4 w-4" />
          Edit profile
        </Link>
      </div>

      <dl className="relative grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06]">
        <Stat
          label="Confirmed tickets"
          shortLabel="Tickets"
          value={confirmed.data ? confirmed.data.total.toLocaleString('en-US') : null}
          failed={confirmed.isError}
          hint={
            <Link
              href={ACCOUNT_ROUTES.tickets}
              className="text-xs font-semibold text-ink-300 hover:text-ink-50"
            >
              View tickets →
            </Link>
          }
        />
        <Stat
          label="Awaiting payment"
          shortLabel="To pay"
          value={pending.data ? pending.data.total.toLocaleString('en-US') : null}
          failed={pending.isError}
          highlight={(pending.data?.total ?? 0) > 0}
          hint={
            pending.data ? (
              <span className="text-xs text-ink-400">
                {pending.data.total > 0 ? 'Seats on hold for you' : 'Nothing left to pay'}
              </span>
            ) : null
          }
        />
        <div className="px-4 py-4 sm:px-8 sm:py-5">
          <dt className={STAT_LABEL}>Profile</dt>
          <dd className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-ink-50 sm:text-3xl">
            {profile.percent}%
          </dd>
          <dd className="mt-2">
            <span className="block h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-200"
                style={{ width: `${profile.percent}%` }}
              />
            </span>
            {profile.missing.length > 0 ? (
              <Link
                href={ACCOUNT_ROUTES.profile}
                className="mt-2 hidden text-xs font-semibold text-gold-300 hover:text-gold-200 sm:inline-block"
              >
                {profile.missing[0]} →
              </Link>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

const STAT_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400 sm:text-xs';

function Stat({
  label,
  shortLabel,
  value,
  failed,
  hint,
  highlight = false,
}: {
  label: string;
  /** What phones show: three long labels side by side would wrap. */
  shortLabel: string;
  value: string | null;
  failed: boolean;
  /** A line under the number, for wider screens. */
  hint?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="px-4 py-4 sm:px-8 sm:py-5">
      <dt className={STAT_LABEL}>
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </dt>
      <dd
        className={`mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl ${
          highlight ? 'text-gold-200' : 'text-ink-50'
        }`}
      >
        {value ?? (failed ? '—' : <Placeholder />)}
      </dd>
      {hint ? <dd className="mt-2 hidden sm:block">{hint}</dd> : null}
    </div>
  );
}

function Avatar({ user }: { user: PublicUser }) {
  const avatar = assetUrl(user.avatarUrl);
  return (
    // A gold ring, like the edge of a premium ticket.
    <span className="inline-flex shrink-0 self-start rounded-full bg-gradient-to-br sm:self-center from-gold-300 via-gold-500/60 to-brand-500/60 p-[2px] shadow-lift">
      <span className="inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-ink-900 font-display text-2xl font-semibold text-ink-50 sm:h-24 sm:w-24 sm:text-3xl">
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(user.name)
        )}
      </span>
    </span>
  );
}

/* -------------------------------------------------------- pending payment */

/**
 * A booking still waiting for payment is the one thing worth interrupting for:
 * its seats are held only until `expiresAt`. Shown only while that hold lasts.
 */
function PendingPayment() {
  const pending = useBookingCount('PENDING');
  const now = useNow(1000);
  const booking = pending.data?.items[0];
  if (!booking?.expiresAt || now === null) return null;
  const left = Date.parse(booking.expiresAt) - now;
  if (left <= 0) return null;

  return (
    <section
      aria-label="Booking awaiting payment"
      className="flex flex-col gap-4 rounded-3xl border border-gold-400/40 bg-gold-400/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-gold-200">
          <ClockIcon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="font-semibold text-gold-100">Seats held for {booking.show.movie.title}</p>
          <p className="mt-0.5 text-sm text-gold-100/80">
            <span className="font-mono tabular-nums">{countdown(left)}</span> left to finish paying
            — after that the seats go back on sale.
          </p>
        </div>
      </div>
      <Link
        href={`/checkout/${encodeURIComponent(booking.id)}`}
        className="btn-primary shrink-0 self-start sm:self-center"
      >
        Continue checkout
      </Link>
    </section>
  );
}

/* ---------------------------------------------------------- other states */

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 sm:gap-8">
      <span className="sr-only">Loading your account</span>
      <div aria-hidden="true" className="card flex items-center gap-6 rounded-[28px] p-6 sm:p-8">
        <span className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none sm:h-24 sm:w-24" />
        <span className="flex flex-1 flex-col gap-3">
          <span className="h-3 w-24 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <span className="h-8 w-64 max-w-full animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <span className="h-3 w-48 max-w-full animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none" />
        </span>
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none sm:h-40"
            />
          ))}
        </div>
        <span className="h-72 animate-pulse rounded-3xl bg-white/[0.04] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function SessionEnded() {
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl text-ink-50">Your session has ended</h1>
      <p className="text-sm text-ink-300">Sign in again to open your account.</p>
      <Link href="/login?next=/account" className="btn-primary">
        Sign in
      </Link>
    </div>
  );
}

function Placeholder() {
  return (
    <span
      aria-label="Loading"
      className="inline-block h-7 w-12 animate-pulse rounded-lg bg-white/[0.06] align-middle motion-reduce:animate-none"
    />
  );
}

/* --------------------------------------------------------------- helpers */

/** What a complete profile has beyond name and email, and what is still missing. */
function profileCompleteness(user: PublicUser): { percent: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [Boolean(user.avatarUrl), 'Add a profile photo'],
    [Boolean(user.phone), 'Add your phone number'],
    [Boolean(user.preferredCity), 'Choose your city'],
    [user.preferredGenres.length > 0, 'Pick favourite genres'],
  ];
  const done = checks.filter(([ok]) => ok).length + 2; // name + email always exist
  return {
    percent: Math.round((done / (checks.length + 2)) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, hint]) => hint),
  };
}

/** "Good evening" on the visitor's own clock (this only renders in the browser). */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
