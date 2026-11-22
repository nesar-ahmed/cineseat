import type { ComponentType, SVGProps } from 'react';
import {
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
  DashboardIcon,
  FilmIcon,
  MegaphoneIcon,
  PercentIcon,
  QrIcon,
  ReceiptIcon,
  StarIcon,
  TicketIcon,
  UsersIcon,
} from '../../components/ui/icons';

import { ADMIN_ROOT, ADMIN_ROUTES } from './links';

export { ADMIN_ROOT };

export type AdminNavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * False until the page exists: the item is shown (so the panel's shape is
   * clear) but not linked, and says "Soon" — never a link to a 404.
   */
  ready: boolean;
  /** Matches only this exact path (the dashboard), not everything under it. */
  exact?: boolean;
};

export type AdminNavSection = { title: string | null; items: AdminNavItem[] };

/**
 * The admin panel's sections, in the order an admin works: see how things are
 * going, run the catalog, follow the money, look after people, talk to them,
 * and check the record. Comments say which API each page will use.
 */
export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: null,
    items: [
      {
        label: 'Dashboard',
        href: ADMIN_ROUTES.dashboard,
        icon: DashboardIcon,
        ready: true,
        exact: true,
      }, // GET /admin/dashboard
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Movies', href: ADMIN_ROUTES.movies, icon: FilmIcon, ready: true }, // GET /admin/movies + /movies CRUD, posters, bulk
      {
        label: 'Theaters',
        href: ADMIN_ROUTES.theaters,
        icon: BuildingIcon,
        ready: true,
      }, // GET /admin/theaters + /theaters, /screens CRUD
      { label: 'Showtimes', href: ADMIN_ROUTES.shows, icon: CalendarIcon, ready: true }, // GET /admin/shows + /shows CRUD, batch, bulk
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Bookings', href: ADMIN_ROUTES.bookings, icon: TicketIcon, ready: true }, // GET /admin/bookings (read-only)
      { label: 'Payments', href: ADMIN_ROUTES.payments, icon: ReceiptIcon, ready: true }, // GET /admin/payments (read-only)
      { label: 'Offers', href: ADMIN_ROUTES.offers, icon: PercentIcon, ready: false }, // needs coupon CRUD
      { label: 'Check-in', href: ADMIN_ROUTES.checkIn, icon: QrIcon, ready: false }, // needs a booking-code lookup
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Users', href: ADMIN_ROUTES.users, icon: UsersIcon, ready: true }, // GET /admin/users + PATCH /users/:id/role
      { label: 'Reviews', href: ADMIN_ROUTES.reviews, icon: StarIcon, ready: false }, // reviews feature not built
    ],
  },
  {
    title: 'Engage',
    items: [
      { label: 'Notifications', href: ADMIN_ROUTES.notifications, icon: BellIcon, ready: true }, // /notifications?category=admin
      {
        label: 'Announcements',
        href: ADMIN_ROUTES.announcements,
        icon: MegaphoneIcon,
        ready: false,
      }, // POST /notifications/announcements (exists)
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Reports', href: ADMIN_ROUTES.reports, icon: ChartIcon, ready: false }, // needs reports + CSV export
      { label: 'Audit log', href: ADMIN_ROUTES.auditLog, icon: ClipboardIcon, ready: false }, // needs an audit-log API
    ],
  },
];

/** Whether `item` is the page at `pathname`. */
export function isActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The nav item for the current page, for the top bar's title. */
export function currentItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV.flatMap((section) => section.items).find((item) => isActive(item, pathname));
}

/** Remembers the sidebar's state across visits; read by the admin layout on the server. */
export const SIDEBAR_COOKIE = 'cineseat_admin_sidebar';
