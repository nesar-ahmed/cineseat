'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { PublicUser } from '@cineseat/shared';
import { firstName, initialsOf } from '../../components/layout/site-header';
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LogoMark,
  MenuIcon,
  SignOutIcon,
  UserIcon,
} from '../../components/ui/icons';
import { assetUrl } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';
import { AdminNotificationBell } from './admin-bell';
import { ADMIN_ROOT, currentItem } from './nav';

/**
 * The admin panel's top navbar: where you are, a way back to the public site,
 * the notification bell and the admin's own menu. On small screens it also
 * opens the navigation drawer (the left navbar is hidden there).
 */
export function AdminTopbar({ user, onOpenNav }: { user: PublicUser; onOpenNav: () => void }) {
  const pathname = usePathname();
  const page = currentItem(pathname);

  return (
    <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open admin navigation"
          className="btn-icon lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Link href={ADMIN_ROOT} aria-label="CineSeat admin — dashboard" className="lg:hidden">
          <LogoMark />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">Admin</p>
          <p className="truncate text-sm font-semibold text-ink-50">
            {page?.label ?? 'Admin panel'}
          </p>
        </div>

        {/* The session area is the panels' positioning context, like the site header's. */}
        <div className="relative flex items-center gap-2">
          <Link
            href="/"
            className="hidden h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink-300 transition hover:bg-white/[0.05] hover:text-ink-50 motion-reduce:transition-none sm:inline-flex"
          >
            View site
            <ExternalLinkIcon className="h-4 w-4" />
          </Link>
          <AdminNotificationBell userId={user.id} />
          <AdminAccountMenu user={user} />
        </div>
      </div>
    </div>
  );
}

function AdminAccountMenu({ user }: { user: PublicUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const avatar = assetUrl(user.avatarUrl);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push('/');
  };

  const item =
    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-200 hover:bg-white/[0.06]';

  return (
    <div ref={root}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.name}`}
        className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm text-ink-100 transition hover:border-white/20 motion-reduce:transition-none sm:pr-3"
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
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-ink-900 p-1.5 shadow-lift motion-reduce:animate-none"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-50">{user.name}</p>
            <p className="truncate text-xs text-ink-400">{user.email}</p>
            <span className="mt-1.5 inline-block rounded-md border border-gold-500/40 bg-gold-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-300">
              Administrator
            </span>
          </div>
          <div className="my-1 h-px bg-white/[0.06]" />
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={item}>
            <UserIcon className="h-4 w-4 text-ink-400" /> My account
          </Link>
          <Link role="menuitem" href="/" onClick={() => setOpen(false)} className={item}>
            <ExternalLinkIcon className="h-4 w-4 text-ink-400" /> View site
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={handleSignOut}
            className={`${item} w-full text-left`}
          >
            <SignOutIcon className="h-4 w-4 text-ink-400" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
