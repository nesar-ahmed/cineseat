'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkMovieActionInput,
  CreateMovieInput,
  MovieStatus,
  UpdateMovieInput,
} from '@cineseat/shared';
import {
  bulkMovies,
  createMovie,
  deleteMovie,
  getAdminMovie,
  getAdminMovies,
  removeMoviePoster,
  updateMovie,
  uploadMoviePoster,
  type AdminMovieParams,
} from '../../../lib/api';
import { refreshAfterChange } from '../cache';

/**
 * The admin movies module's server data. Keys start with `['admin', userId]`
 * like the dashboard's, so one admin's data is never shown to the next person
 * who signs in on the browser. Every change refreshes the admin views *and* the
 * public site's movie caches (catalog, movie pages, filters), so an edit shows
 * everywhere at once.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'movies'] as const;

export function useAdminMovies(userId: string | undefined, params: AdminMovieParams) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminMovies(params),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

export function useAdminMovie(userId: string | undefined, id: string) {
  return useQuery({
    queryKey: [...root(userId), 'detail', id],
    queryFn: () => getAdminMovie(id),
    enabled: Boolean(userId),
    staleTime: 15_000,
    // Another movie must never show the previous one's details while loading.
    placeholderData: undefined,
  });
}

export function useCreateMovie(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMovieInput) => createMovie(input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useUpdateMovie(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMovieInput }) => updateMovie(id, input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

/** Status only — the list's and the detail page's quick switch. */
export function useSetMovieStatus(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MovieStatus }) =>
      updateMovie(id, { status }),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useDeleteMovie(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMovie(id),
    onSuccess: (_nothing, id) => {
      // The deleted movie's own queries would only 404 now.
      client.removeQueries({ queryKey: [...root(userId), 'detail', id] });
      client.removeQueries({ queryKey: ['movie', id] });
      return refreshAfterChange(client, userId);
    },
  });
}

export function useUploadPoster(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadMoviePoster(id, file),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useRemovePoster(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeMoviePoster(id),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useBulkMovies(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkMovieActionInput) => bulkMovies(input),
    onSuccess: (result, input) => {
      if (input.action === 'delete') {
        for (const id of result.succeeded) {
          client.removeQueries({ queryKey: [...root(userId), 'detail', id] });
          client.removeQueries({ queryKey: ['movie', id] });
        }
      }
      return refreshAfterChange(client, userId);
    },
  });
}
