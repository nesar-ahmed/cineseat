'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCatalogFilters, useTheaters } from '../../features/catalog/queries';
import { MapPinIcon } from '../ui/icons';
import { isAdminPath, Wordmark } from './site-header';
import { ACCOUNT_ROUTES } from '../../features/account/links';

type FooterLink = { href: string; label: string };

const help: FooterLink[] = [
  { href: '/#faq', label: 'Booking FAQ' },
  { href: '/#offers', label: 'Offers & coupons' },
  { href: '/account', label: 'My account' },
  { href: ACCOUNT_ROUTES.tickets, label: 'My tickets' },
];

/** Genre and cinema links come from the catalog (same cached queries as the pages). */
export function SiteFooter() {
  const pathname = usePathname();
  const genres = useCatalogFilters().data?.genres ?? [];
  const theaters = useTheaters().data ?? [];
  const screens = theaters.reduce((sum, theater) => sum + theater.screenCount, 0);
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Movies',
      links: [
        { href: '/movies', label: 'Now showing' },
        { href: '/movies?tab=soon', label: 'Coming soon' },
        ...genres
          .slice(0, 4)
          .map((genre) => ({
            href: `/movies?tab=all&genre=${encodeURIComponent(genre)}`,
            label: genre,
          })),
      ],
    },
    {
      title: 'Cinemas',
      links: theaters.map((theater) => ({
        href: `/movies?cinema=${theater.id}`,
        label: theater.name.replace('CineSeat ', ''),
      })),
    },
    { title: 'Help', links: help },
  ];

  // No CineSeat chrome on the test payment gateway (see SiteHeader).
  if (pathname.startsWith('/pay/') || isAdminPath(pathname)) return null;

  return (
    <footer className="relative mt-8 border-t border-white/[0.06] bg-ink-950 print:hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"
      />
      <div className="container-x py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-400">
              Pick your exact seat, hold it for five minutes while you pay, and show your booking
              code at the cinema. Cinemas in Dhaka and Chattogram.
            </p>
            <p className="mt-5 flex items-center gap-2 text-xs text-ink-400">
              <MapPinIcon className="h-4 w-4 text-brand-400" />
              {theaters.length
                ? `${theaters.length} cinemas · ${screens} screens · recliner rows in every hall`
                : 'Cinemas in Dhaka and Chattogram'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  {column.title}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-ink-300 transition hover:text-ink-50">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CineSeat</p>
        </div>
      </div>
    </footer>
  );
}
