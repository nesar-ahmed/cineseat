'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Saved movies, kept in localStorage until the wishlist endpoints exist (the
 * `wishlists` table is already in the schema). Every component that calls this
 * hook sees the same list, and other tabs stay in sync through `storage` events.
 */
const KEY = 'cineseat:watchlist';
const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function parse(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Same array back while storage is unchanged, as useSyncExternalStore requires. */
function read(): string[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cache.raw) cache = { raw, ids: parse(raw) };
  return cache.ids;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useWatchlist() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    window.localStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((listener) => listener());
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, has, toggle };
}
