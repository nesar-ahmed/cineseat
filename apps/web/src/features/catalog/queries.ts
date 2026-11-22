'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getCatalogFacets,
  getCatalogFilters,
  getMovie,
  getMovieShowtimes,
  getMovies,
  getShows,
  getTheaters,
  type MovieParams,
  type ShowParams,
} from '../../lib/api';
import { withArt, type CatalogMovie } from './art';

/**
 * Server data for the catalog, home and search, through one cache. Lists come
 * back with poster art attached, so components never deal with the raw shape.
 */
const FIVE_MINUTES = 5 * 60_000;

/** Filter vocabulary, theaters and bookable dates — changes rarely. */
export function useCatalogFilters() {
  return useQuery({
    queryKey: ['catalog', 'filters'],
    queryFn: getCatalogFilters,
    staleTime: FIVE_MINUTES,
  });
}

export function useMovies(params: MovieParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['movies', params],
    queryFn: async () => {
      const page = await getMovies(params);
      return { ...page, items: page.items.map(withArt) };
    },
    enabled: options.enabled ?? true,
  });
}

/** The catalog grid: pages of results, "Show more" fetches the next. */
export function useMovieList(
  params: Omit<MovieParams, 'page'>,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: ['movies', 'list', params],
    queryFn: async ({ pageParam }) => {
      const page = await getMovies({ ...params, page: pageParam });
      return { ...page, items: page.items.map(withArt) };
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: options.enabled ?? true,
  });
}

/** One movie. `initial` (the server-rendered movie) paints its page without a request. */
export function useMovie(id: string | null, initial?: CatalogMovie) {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: async () => withArt(await getMovie(id!)),
    enabled: Boolean(id),
    initialData: initial,
    // A different movie must never show the previous one's details while loading.
    placeholderData: undefined,
  });
}

export function useFacets(params: MovieParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['catalog', 'facets', params],
    queryFn: () => getCatalogFacets(params),
    enabled: options.enabled ?? true,
  });
}

export function useMovieShowtimes(id: string | null) {
  return useQuery({
    queryKey: ['movie', id, 'showtimes'],
    queryFn: () => getMovieShowtimes(id!),
    enabled: Boolean(id),
    placeholderData: undefined,
    // Seats sell while the movie's page is open: keep availability reasonably fresh.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useShows(params: ShowParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['shows', params],
    queryFn: () => getShows(params),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useTheaters() {
  return useQuery({
    queryKey: ['theaters'],
    queryFn: () => getTheaters(),
    staleTime: FIVE_MINUTES,
  });
}
