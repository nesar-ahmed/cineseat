import type { QueryClient } from '@tanstack/react-query';

/**
 * After an admin change: refresh every admin view (lists, details, dashboard —
 * keys start with `['admin', userId]`) and the public site's caches the change
 * shows up in — movies, catalog filters, cinemas, showtimes and seat maps — so
 * an edit reads the same everywhere at once. Only queries on screen refetch;
 * the rest are marked stale.
 */
export function refreshAfterChange(client: QueryClient, userId: string | undefined) {
  return Promise.all(
    [
      ['admin', userId ?? ''],
      ['movies'],
      ['movie'],
      ['catalog'],
      ['theaters'],
      ['shows'],
      ['seat-map'],
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

/** Forget a deleted thing's own queries — they would only 404 now. */
export function forget(client: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const queryKey of keys) client.removeQueries({ queryKey });
}
