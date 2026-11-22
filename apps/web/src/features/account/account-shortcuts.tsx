'use client';

import { useState, type ComponentType, type SVGProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicUser } from '@cineseat/shared';
import {
  BellIcon,
  ChevronRightIcon,
  LockIcon,
  MailIcon,
  ReceiptIcon,
  SignOutIcon,
  SlidersIcon,
  TicketIcon,
  UserIcon,
} from '../../components/ui/icons';
import { useAuth } from '../auth/auth-provider';
import { useBookingCount } from '../bookings/queries';
import { useInvoiceCount } from '../invoices/queries';
import { useUnreadNotificationCount } from '../notifications/queries';
import { ACCOUNT_ROUTES } from './links';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type Shortcut = {
  href: string;
  title: string;
  description: string;
  icon: Icon;
  /** Accent for the icon tile: gold for tickets (the site's "ticket" colour), rose otherwise. */
  tone: 'gold' | 'brand' | 'ink';
  /** A short line under the title; `null` while it loads. */
  meta: string | null;
};

const TONE: Record<Shortcut['tone'], string> = {
  gold: 'bg-gold-400/15 text-gold-200 ring-gold-400/30',
  brand: 'bg-brand-500/15 text-brand-200 ring-brand-500/30',
  ink: 'bg-white/[0.06] text-ink-100 ring-white/15',
};

/** The four doors out of the overview: one tile per part of the panel. */
export function AccountShortcuts() {
  const confirmed = useBookingCount('CONFIRMED');
  const pending = useBookingCount('PENDING');
  const invoices = useInvoiceCount();
  const { user } = useAuth();
  const unread = useUnreadNotificationCount(user?.id);

  const count = (n: number | undefined, word: string) =>
    n === undefined ? null : `${n.toLocaleString('en-US')} ${word}`;

  const awaiting = pending.data?.total ?? 0;
  const shortcuts: Shortcut[] = [
    {
      href: ACCOUNT_ROUTES.tickets,
      title: 'My tickets',
      description: 'Upcoming shows, past visits and your booking codes.',
      icon: TicketIcon,
      tone: 'gold',
      meta:
        awaiting > 0
          ? `${count(confirmed.data?.total, 'confirmed') ?? '…'} · ${awaiting} awaiting payment`
          : confirmed.isError
            ? 'All your bookings'
            : count(confirmed.data?.total, 'confirmed'),
    },
    {
      href: ACCOUNT_ROUTES.invoices,
      title: 'Invoices',
      description: 'A receipt for every paid booking, ready to print.',
      icon: ReceiptIcon,
      tone: 'brand',
      meta: invoices.isError ? 'Receipts & refunds' : count(invoices.data?.total, 'invoices'),
    },
    {
      href: ACCOUNT_ROUTES.notifications,
      title: 'Notifications',
      description: 'Booking confirmations, refunds and offers.',
      icon: BellIcon,
      tone: 'brand',
      meta: unread.isError
        ? 'Updates & alerts'
        : unread.data === undefined
          ? null
          : unread.data.unread > 0
            ? `${unread.data.unread.toLocaleString('en-US')} unread`
            : 'All caught up',
    },
    {
      href: ACCOUNT_ROUTES.settings,
      title: 'Account settings',
      description: 'Update your profile, email address and password.',
      icon: SlidersIcon,
      tone: 'ink',
      meta: 'Profile · Email · Password',
    },
  ];

  return (
    <section aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className="text-xl font-semibold tracking-tight text-ink-50">
        Your account
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.href}>
            <ShortcutTile shortcut={shortcut} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShortcutTile({ shortcut }: { shortcut: Shortcut }) {
  const { href, title, description, icon: IconComponent, tone, meta } = shortcut;
  return (
    <Link
      href={href}
      className="group relative flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-inset transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.045] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 sm:h-11 sm:w-11 ${TONE[tone]}`}
        >
          <IconComponent className="h-5 w-5" />
        </span>
        <ChevronRightIcon className="h-4 w-4 text-ink-500 transition duration-200 group-hover:translate-x-0.5 group-hover:text-ink-200 motion-reduce:transition-none" />
      </span>
      <span className="mt-4 text-[15px] font-semibold leading-snug text-ink-50 sm:text-base">
        {title}
      </span>
      <span className="mt-1 hidden text-sm leading-relaxed text-ink-400 sm:block">
        {description}
      </span>
      <span className="mt-auto pt-3 text-xs font-medium text-ink-300">
        {meta ?? (
          <span
            aria-label="Loading"
            className="inline-block h-3 w-20 animate-pulse rounded-full bg-white/[0.06] align-middle motion-reduce:animate-none"
          />
        )}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------- settings */

/**
 * Account settings at a glance: what is on file now, and a direct way to the
 * page that changes it. Sign out lives here too, where people look for it.
 */
export function SettingsCard({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const rows: { href: string; icon: Icon; label: string; value: string }[] = [
    {
      href: ACCOUNT_ROUTES.profile,
      icon: UserIcon,
      label: 'Profile',
      value: [user.name, user.phone, user.preferredCity].filter(Boolean).join(' · '),
    },
    { href: ACCOUNT_ROUTES.email, icon: MailIcon, label: 'Email address', value: user.email },
    {
      href: ACCOUNT_ROUTES.password,
      icon: LockIcon,
      label: 'Password',
      value: 'Change your password',
    },
  ];

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push('/');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <section aria-labelledby="settings-title" className="card rounded-3xl p-2">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 id="settings-title" className="text-xl font-semibold tracking-tight text-ink-50">
          Account settings
        </h2>
        <Link
          href={ACCOUNT_ROUTES.settings}
          className="rounded-full px-2 py-1 text-sm font-semibold text-brand-300 hover:text-brand-200"
        >
          Manage
        </Link>
      </div>
      <ul className="flex flex-col">
        {rows.map(({ href, icon: IconComponent, label, value }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition hover:bg-white/[0.04] motion-reduce:transition-none"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 ring-1 ring-white/10">
                <IconComponent className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-50">{label}</span>
                <span className="block truncate text-xs text-ink-400">{value}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-ink-200 motion-reduce:transition-none" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-1 border-t border-white/[0.06] p-2">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="flex w-full items-center gap-3.5 rounded-2xl px-2 py-3 text-sm font-semibold text-ink-300 transition hover:bg-white/[0.04] hover:text-ink-50 disabled:opacity-60 motion-reduce:transition-none"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center">
            <SignOutIcon className="h-[18px] w-[18px]" />
          </span>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  );
}
