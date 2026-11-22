'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../features/auth/auth-provider';
import { assetUrl } from '../../lib/api';
import { useWatchlist } from '../../hooks/use-watchlist';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  DashboardIcon,
  HeartIcon,
  LogoMark,
  TicketIcon,
  UserIcon,
} from '../ui/icons';
import { ACCOUNT_ROUTES } from '../../features/account/links';
import { NotificationBell } from '../../features/notifications/notification-bell';
import { ADMIN_ROOT } from '../../features/admin/nav';

/** The admin panel (`/admin`, `/admin/…`) draws its own frame. */
export const isAdminPath = (pathname: string) =>
  pathname === ADMIN_ROOT || pathname.startsWith(`${ADMIN_ROOT}/`);

/** The logo. `compact`: the mark alone on the narrowest phones, so the header's centre stays centred. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CineSeat home">
      <LogoMark />
      <span
        className={`font-display text-xl font-semibold tracking-tight text-ink-50 ${compact ? 'max-[379px]:hidden' : ''}`}
      >
        Cine<span className="text-brand-400">Seat</span>
      </span>
    </Link>
  );
}

/**
 * The bar on every page: the wordmark (home) on the left, Movies in the centre,
 * and — signed in — the notification bell and the account menu, always the last
 * thing on the right. One link needs no hamburger menu, so the same bar serves
 * phones and desktops.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, signOut } = useAuth();
  const { ids: saved } = useWatchlist();
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Over a full-bleed hero (home, a movie's page) the bar starts transparent and frosts once you scroll.
  const overHero = (pathname === '/' || /^\/movies\/[^/]+$/.test(pathname)) && !scrolled;
  // Seat maps and checkout are part of booking a movie.
  const moviesActive = ['/movies', '/shows/', '/checkout/'].some((path) =>
    pathname.startsWith(path),
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setAccountOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  // A new page closes the menu.
  useEffect(() => setAccountOpen(false), [pathname]);

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    router.push('/');
  };

  const avatar = assetUrl(user?.avatarUrl);
  const menuItem =
    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-200 hover:bg-white/[0.06]';

  // The test payment gateway (/pay/…) stands in for another company's site: no CineSeat chrome.
  // The admin panel (/admin/…) has navbars of its own.
  if (pathname.startsWith('/pay/') || isAdminPath(pathname)) return null;

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 motion-reduce:transition-none print:hidden ${
        overHero
          ? 'border-b border-transparent bg-gradient-to-b from-ink-950/80 to-transparent'
          : 'border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl'
      }`}
    >
      {/* Three columns, the outer two equal: Movies sits in the true centre of the bar. */}
      <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 sm:h-[72px]">
        <div className="justify-self-start">
          <Wordmark compact />
        </div>

        <nav aria-label="Primary">
          <Link
            href="/movies"
            aria-current={moviesActive ? 'page' : undefined}
            className={`relative rounded-full px-3.5 py-2 text-sm font-medium transition motion-reduce:transition-none ${
              moviesActive ? 'text-ink-50' : 'text-ink-300 hover:text-ink-50'
            }`}
          >
            Movies
            {moviesActive ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-brand-500"
              />
            ) : null}
          </Link>
        </nav>

        {/* Session area: a same-size placeholder while the session check runs avoids layout jump.
            It is the bell panel's positioning context, so that panel can use the bar's width. */}
        <div className="relative flex items-center gap-2 justify-self-end">
          {status === 'loading' ? (
            <span
              className="block h-10 w-10 rounded-full bg-white/[0.04] sm:w-24"
              aria-hidden="true"
            />
          ) : user ? (
            <>
              <NotificationBell userId={user.id} />
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountOpen((value) => !value)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${user.name}`}
                  className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm text-ink-100 transition hover:border-white/20 sm:pr-3"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-xs font-bold text-white">
                    {avatar ? (
                      <img src={avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(user.name)
                    )}
                  </span>
                  <span className="hidden max-w-28 truncate sm:inline">{firstName(user.name)}</span>
                  <ChevronDownIcon className="hidden h-3.5 w-3.5 text-ink-400 sm:block" />
                </button>
                {accountOpen ? (
                  // Solid, not frosted: the header's own backdrop-filter makes it the backdrop
                  // root, so a blur here could not reach the page and text would show through.
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-ink-900/[0.97] p-1.5 shadow-lift motion-reduce:animate-none"
                  >
                    <p className="px-3 py-2 text-xs text-ink-400">
                      Signed in as{' '}
                      <span className="block truncate font-semibold text-ink-100">
                        {user.email}
                      </span>
                    </p>
                    <Link
                      role="menuitem"
                      href={ACCOUNT_ROUTES.tickets}
                      onClick={() => setAccountOpen(false)}
                      className={menuItem}
                    >
                      <TicketIcon className="h-4 w-4 text-ink-400" /> My tickets
                    </Link>
                    <Link
                      role="menuitem"
                      href="/movies?tab=all&saved=1"
                      onClick={() => setAccountOpen(false)}
                      className={menuItem}
                    >
                      <HeartIcon className="h-4 w-4 text-ink-400" /> Watchlist
                      <span className="ml-auto text-xs text-ink-400">{saved.length}</span>
                    </Link>
                    <Link
                      role="menuitem"
                      href="/account"
                      onClick={() => setAccountOpen(false)}
                      className={menuItem}
                    >
                      <UserIcon className="h-4 w-4 text-ink-400" /> My account
                    </Link>
                    {user.role === 'ADMIN' ? (
                      <Link
                        role="menuitem"
                        href={ADMIN_ROOT}
                        onClick={() => setAccountOpen(false)}
                        className={menuItem}
                      >
                        <DashboardIcon className="h-4 w-4 text-ink-400" /> Admin panel
                      </Link>
                    ) : null}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={handleSignOut}
                      className={`${menuItem} w-full text-left`}
                    >
                      <ArrowRightIcon className="h-4 w-4 text-ink-400" /> Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-sm font-semibold text-ink-100 transition hover:bg-white/[0.06]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
