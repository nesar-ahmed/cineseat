'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRightIcon, LockIcon, MailIcon, UserIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { ACCOUNT_ROUTES } from '../links';
import { PanelHeader } from '../panel-header';

type Section = {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const SECTIONS: Section[] = [
  {
    href: ACCOUNT_ROUTES.profile,
    label: 'Profile',
    description: 'Photo, name, phone and preferences',
    icon: UserIcon,
  },
  {
    href: ACCOUNT_ROUTES.email,
    label: 'Email address',
    description: 'The address you sign in with',
    icon: MailIcon,
  },
  {
    href: ACCOUNT_ROUTES.password,
    label: 'Password',
    description: 'Keep your account secure',
    icon: LockIcon,
  },
];

/**
 * Frame of every settings page (`/account/settings/*`): the way back to the
 * account overview, the page title, and the section navigation — a side list on
 * wide screens, a swipeable row of pills on phones. The pages render inside.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, status } = useAuth();
  const current = SECTIONS.find((section) => pathname.startsWith(section.href));

  return (
    <div>
      <PanelHeader
        trail={[
          { label: 'My account', href: ACCOUNT_ROUTES.overview },
          { label: 'Settings', href: current ? undefined : ACCOUNT_ROUTES.settings },
          ...(current ? [{ label: current.label }] : []),
        ]}
        eyebrow="Account settings"
        title={current?.label ?? 'Settings'}
        description={current?.description ?? 'Manage your profile and how you sign in.'}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 sm:mt-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <SectionNav pathname={pathname} />
        <div className="min-w-0 max-w-3xl">
          {status === 'loading' ? (
            <ContentSkeleton />
          ) : !user ? (
            <SessionEnded next={pathname} />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function SectionNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      {/* Phones and tablets: one swipeable row. */}
      <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:hidden">
        {SECTIONS.map(({ href, label, icon: IconComponent }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition motion-reduce:transition-none ${
                  active
                    ? 'border-brand-500/70 bg-brand-500/15 text-ink-50'
                    : 'border-ink-700 bg-ink-900/60 text-ink-300 hover:border-ink-500 hover:text-ink-50'
                }`}
              >
                <IconComponent className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: a side list with a line of context per section. */}
      <ul className="card hidden flex-col gap-1 rounded-3xl p-2 lg:flex">
        {SECTIONS.map(({ href, label, description, icon: IconComponent }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-2xl px-3 py-3 transition motion-reduce:transition-none ${
                  active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'
                }`}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-gold-400"
                  />
                ) : null}
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    active
                      ? 'bg-gold-400/15 text-gold-200 ring-gold-400/30'
                      : 'bg-white/[0.05] text-ink-300 ring-white/10'
                  }`}
                >
                  <IconComponent className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold ${active ? 'text-ink-50' : 'text-ink-200'}`}
                  >
                    {label}
                  </span>
                  <span className="block text-xs leading-snug text-ink-400">{description}</span>
                </span>
                <ChevronRightIcon
                  className={`h-4 w-4 shrink-0 transition motion-reduce:transition-none ${
                    active ? 'text-ink-300' : 'text-ink-600 group-hover:text-ink-300'
                  }`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ContentSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your settings</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="card rounded-3xl p-6 sm:p-7">
          <span className="block h-5 w-40 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <span className="mt-3 block h-3 w-64 max-w-full animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none" />
          <span className="mt-6 block h-11 animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none" />
          <span className="mt-4 block h-11 animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function SessionEnded({ next }: { next: string }) {
  return (
    <div className="card flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
      <h2 className="font-display text-2xl text-ink-50">Your session has ended</h2>
      <p className="text-sm text-ink-300">Sign in again to change your settings.</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary">
        Sign in
      </Link>
    </div>
  );
}
