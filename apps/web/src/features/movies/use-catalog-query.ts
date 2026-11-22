'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { parseQuery, toSearchParams, type CatalogQuery } from './catalog-query';

/**
 * The catalog's state lives in the URL, so every view can be shared and restored.
 * React state mirrors it for instant feedback: a click updates the page in the
 * same frame and the URL follows via `replaceState` (no history entry per click,
 * no server round trip). URL changes from outside — Back/Forward, links — flow
 * back into state. Movies open on their own page, so Back from a movie returns
 * to exactly this view.
 */
export function useCatalogQuery() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [query, setState] = useState(() => parseQuery(new URLSearchParams(params.toString())));

  /** Take the state from a URL, keeping the current object when nothing changed. */
  const adopt = useCallback((search: URLSearchParams) => {
    const fromUrl = parseQuery(search);
    setState((current) =>
      toSearchParams(current).toString() === toSearchParams(fromUrl).toString() ? current : fromUrl,
    );
  }, []);

  // A link or the header search changed the URL (client navigation).
  useEffect(() => adopt(new URLSearchParams(params.toString())), [params, adopt]);

  // Back/Forward: read the address bar directly. Entries rewritten with
  // replaceState are not always replayed through useSearchParams in production builds.
  useEffect(() => {
    const onPopState = () => adopt(new URLSearchParams(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [adopt]);

  const setQuery = useCallback(
    (patch: Partial<CatalogQuery>) => {
      const next = toSearchParams({ ...query, ...patch });
      setState(parseQuery(next));
      const search = next.toString();
      window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}`);
    },
    [query, pathname],
  );

  return { query, setQuery };
}
