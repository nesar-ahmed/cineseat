'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  HeartIcon,
  PercentIcon,
  SeatIcon,
  TicketIcon,
} from '../../components/ui/icons';
import { useWatchlist } from '../../hooks/use-watchlist';
import { useAuth } from '../auth/auth-provider';
import { ACCOUNT_ROUTES } from '../account/links';

/** What an account gives you — only what the site does today. */
const perks = [
  { icon: SeatIcon, label: 'Reserve seats and pay in a few steps' },
  { icon: TicketIcon, label: 'Every booking and its code in one place' },
  { icon: PercentIcon, label: 'Offer codes right at checkout' },
  { icon: HeartIcon, label: 'A watchlist of movies to catch' },
];

export function MembershipCta() {
  const { user, status } = useAuth();
  const { ids } = useWatchlist();

  return (
    <section className="container-x pb-8 pt-24 sm:pt-32">
      <div className="grain relative overflow-hidden rounded-[32px] border border-white/[0.08] px-6 py-12 sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-brand-700/50 via-ink-900 to-gold-700/25"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/25 blur-[100px]"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="section-label text-gold-300">
              {user ? 'Welcome back' : 'Free CineSeat account'}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {user ? (
                <>
                  Good to see you,{' '}
                  <span className="italic text-gold-300">{user.name.split(' ')[0]}</span>.
                </>
              ) : (
                <>
                  Your seats, saved.
                  <span className="block italic text-gold-300">Your nights, sorted.</span>
                </>
              )}
            </h2>
            <p className="mt-4 max-w-xl text-ink-200">
              {user
                ? `You have ${ids.length} ${ids.length === 1 ? 'movie' : 'movies'} on your watchlist. Pick a show and we will keep your seats for five minutes.`
                : 'Reserving seats needs a free account. It takes a minute, and keeps all your bookings and booking codes together.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {status === 'loading' ? (
                <span className="h-12 w-48 rounded-full bg-white/10" aria-hidden="true" />
              ) : user ? (
                <>
                  <Link href="/movies" className="btn-primary">
                    Book tickets <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                  <Link
                    href={ACCOUNT_ROUTES.tickets}
                    className="btn-ghost border-white/15 bg-white/10"
                  >
                    My tickets
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup" className="btn-primary">
                    Create free account <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                  <Link href="/login" className="btn-ghost border-white/15 bg-white/10">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {perks.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/40 px-4 py-3.5 text-sm font-medium text-ink-100 backdrop-blur"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-gold-300">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
