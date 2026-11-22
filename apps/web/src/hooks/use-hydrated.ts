'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true from the first client render
 * after it. For UI that is built from browser-only data — the TanStack Query
 * cache can already hold an answer when a Suspense boundary hydrates late, and
 * rendering it there would not match the server's HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
