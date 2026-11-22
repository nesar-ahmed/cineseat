/**
 * Every page of the user panel, in one place. The overview links to all of them;
 * the pages themselves (tickets, invoices, notifications, settings) are built in
 * later steps and must live at these paths. Booking details already exist at
 * `bookingHref()` in features/bookings/queries.ts (`/account/bookings/:id`).
 */
export const ACCOUNT_ROUTES = {
  overview: '/account',
  tickets: '/account/bookings',
  invoices: '/account/invoices',
  notifications: '/account/notifications',
  settings: '/account/settings',
  profile: '/account/settings/profile',
  email: '/account/settings/email',
  password: '/account/settings/password',
} as const;

/** One invoice's page; invoices share the id of the booking they bill. */
export const invoiceHref = (id: string) => `${ACCOUNT_ROUTES.invoices}/${encodeURIComponent(id)}`;
