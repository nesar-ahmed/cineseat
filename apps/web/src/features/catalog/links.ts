/**
 * Where a movie's showtimes start: the city and day the visitor was browsing,
 * and optionally one showtime they already picked (a time chip in the catalog).
 */
export type MovieLinkContext = {
  city?: string | null;
  /** `YYYY-MM-DD` on the cinemas' clock. */
  date?: string | null;
  show?: string | null;
};

/** The movie's detail page — the one place every card, rail and search result leads. */
export function movieHref(id: string, context: MovieLinkContext = {}): string {
  const params = new URLSearchParams();
  if (context.city) params.set('city', context.city);
  if (context.date) params.set('date', context.date);
  if (context.show) params.set('show', context.show);
  const search = params.toString();
  return `/movies/${encodeURIComponent(id)}${search ? `?${search}` : ''}`;
}
