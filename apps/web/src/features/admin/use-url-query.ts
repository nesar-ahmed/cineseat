'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * State that lives in the URL, for the admin panel's lists: a filtered, sorted
 * page can be bookmarked, shared and restored with Back.
 *
 * The same approach as the catalog's `useCatalogQuery`: React state mirrors the
 * URL for instant feedback, and the URL follows with `replaceState` (no history
 * entry per keystroke, no server round trip). URL changes from outside — links
 * such as the page numbers, Back/Forward — flow back into state.
 *
 * `parse` must accept anything (a hand-edited URL) and `serialize` should write
 * only non-default values, so links stay short.
 */
export function useUrlQuery<Q>(
  parse: (params: URLSearchParams) => Q,
  serialize: (query: Q) => URLSearchParams,
) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [query, setState] = useState(() => parse(new URLSearchParams(params.toString())));

  const adopt = useCallback(
    (search: URLSearchParams) => {
      const fromUrl = parse(search);
      setState((current) =>
        serialize(current).toString() === serialize(fromUrl).toString() ? current : fromUrl,
      );
    },
    [parse, serialize],
  );

  useEffect(() => adopt(new URLSearchParams(params.toString())), [params, adopt]);

  // Back/Forward: read the address bar itself (replaceState entries are not
  // always replayed through useSearchParams in production builds).
  useEffect(() => {
    const onPopState = () => adopt(new URLSearchParams(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [adopt]);

  const setQuery = useCallback(
    (patch: Partial<Q>) => {
      const next = serialize({ ...query, ...patch });
      setState(parse(next));
      const search = next.toString();
      window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}`);
    },
    [query, pathname, parse, serialize],
  );

  /** The URL of this page with `patch` applied — for links (page numbers). */
  const hrefWith = useCallback(
    (patch: Partial<Q>) => {
      const search = serialize({ ...query, ...patch }).toString();
      return `${pathname}${search ? `?${search}` : ''}`;
    },
    [query, pathname, serialize],
  );

  return { query, setQuery, hrefWith };
}
