/**
 * Every admin URL in one place: the left navbar and the notifications that link
 * into the admin panel both build their links here. Pages that are not built yet
 * still have their address, so a link made today lands on the right page once
 * it exists (until then the admin frame says it is coming).
 */
export const ADMIN_ROOT = '/admin';

export const ADMIN_ROUTES = {
  dashboard: ADMIN_ROOT,
  movies: `${ADMIN_ROOT}/movies`,
  theaters: `${ADMIN_ROOT}/theaters`,
  shows: `${ADMIN_ROOT}/shows`,
  bookings: `${ADMIN_ROOT}/bookings`,
  payments: `${ADMIN_ROOT}/payments`,
  offers: `${ADMIN_ROOT}/offers`,
  checkIn: `${ADMIN_ROOT}/check-in`,
  users: `${ADMIN_ROOT}/users`,
  reviews: `${ADMIN_ROOT}/reviews`,
  notifications: `${ADMIN_ROOT}/notifications`,
  announcements: `${ADMIN_ROOT}/announcements`,
  reports: `${ADMIN_ROOT}/reports`,
  auditLog: `${ADMIN_ROOT}/audit-log`,
} as const;

const at = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

/** One movie's page (figures, schedule, poster, history). */
export const adminMovieHref = (id: string) => at(ADMIN_ROUTES.movies, id);
/** The form that edits one movie. */
export const adminMovieEditHref = (id: string) => `${at(ADMIN_ROUTES.movies, id)}/edit`;
/** The form that adds a movie. */
export const adminNewMovieHref = `${ADMIN_ROUTES.movies}/new`;
/** One account's page. */
export const adminUserHref = (id: string) => at(ADMIN_ROUTES.users, id);
/** One booking's page; `section` opens a part of it (e.g. its payments). */
export const adminBookingHref = (id: string, section?: 'payments') =>
  `${at(ADMIN_ROUTES.bookings, id)}${section ? `#${section}` : ''}`;
/** One payment attempt: its booking's page, opened on (and highlighting) that attempt. */
export const adminPaymentHref = (bookingId: string, paymentId: string) =>
  `${at(ADMIN_ROUTES.bookings, bookingId)}#payment-${encodeURIComponent(paymentId)}`;
/** One show's page (schedule and seat map). */
export const adminShowHref = (id: string) => at(ADMIN_ROUTES.shows, id);
/** One cinema's page (screens, next shows, history). */
export const adminTheaterHref = (id: string) => at(ADMIN_ROUTES.theaters, id);

const withQuery = (base: string, params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `${base}?${search}` : base;
};

/** The showtimes list narrowed to a movie, a theater or a screen (and optionally a tab). */
export const adminShowsHref = (filter: {
  movie?: string;
  theater?: string;
  screen?: string;
  when?: 'upcoming' | 'today' | 'past' | 'all';
}) =>
  withQuery(ADMIN_ROUTES.shows, {
    movie: filter.movie,
    theater: filter.theater,
    screen: filter.screen,
    when: filter.when === 'upcoming' ? undefined : filter.when,
  });

/** The bookings list narrowed to a show, a movie, a theater or a buyer. */
export const adminBookingsHref = (filter: {
  show?: string;
  movie?: string;
  theater?: string;
  user?: string;
}) => withQuery(ADMIN_ROUTES.bookings, filter);

/** The payments list narrowed to a buyer (and optionally one outcome). */
export const adminPaymentsHref = (filter: {
  user?: string;
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
}) => withQuery(ADMIN_ROUTES.payments, filter);

/** The scheduling page, with the movie, theater and screen already chosen where known. */
export const adminScheduleHref = (
  preset: { movie?: string; theater?: string; screen?: string } = {},
) => withQuery(`${ADMIN_ROUTES.shows}/new`, preset);
/** The offers list, opened on one code. */
export const adminOfferHref = (code: string) =>
  `${ADMIN_ROUTES.offers}?code=${encodeURIComponent(code)}`;
