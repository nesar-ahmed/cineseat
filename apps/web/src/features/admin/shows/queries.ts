'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkShowActionInput, ScheduleShowsInput, UpdateShowInput } from '@cineseat/shared';
import {
  bulkShows,
  deleteShow,
  getAdminShow,
  getAdminShows,
  getSeatMap,
  scheduleShows,
  updateShow,
  type AdminShowParams,
} from '../../../lib/api';
import { forget, refreshAfterChange } from '../cache';

/**
 * The showtimes module's server data, keyed under `['admin', userId]` like every
 * admin view. Each change refreshes the admin views and the public caches
 * (showtimes, seat maps, movie pages) through `refreshAfterChange`.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'shows'] as const;

/** Seats sell while a list is open: keep it reasonably fresh. */
const LIVE = { staleTime: 15_000, refetchInterval: 60_000 } as const;

export function useAdminShows(
  userId: string | undefined,
  params: AdminShowParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminShows(params),
    enabled: Boolean(userId) && (options.enabled ?? true),
    ...LIVE,
  });
}

export function useAdminShow(userId: string | undefined, id: string) {
  return useQuery({
    queryKey: [...root(userId), 'detail', id],
    queryFn: () => getAdminShow(id),
    enabled: Boolean(userId),
    ...LIVE,
    placeholderData: undefined,
  });
}

/** The live seat map (the public one — it is the same for everybody), refreshed often. */
export function useShowSeats(id: string) {
  return useQuery({
    queryKey: ['seat-map', id],
    queryFn: () => getSeatMap(id),
    staleTime: 0,
    refetchInterval: 15_000,
    placeholderData: undefined,
  });
}

/**
 * A dry run of a batch, for the scheduling page's preview: nothing is saved.
 * `input` is null until the form is complete.
 */
export function useSchedulePreview(userId: string | undefined, input: ScheduleShowsInput | null) {
  return useQuery({
    queryKey: [...root(userId), 'preview', input],
    queryFn: () => scheduleShows({ ...input!, dryRun: true }),
    enabled: Boolean(userId) && input !== null,
    staleTime: 10_000,
    retry: false,
  });
}

export function useScheduleShows(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleShowsInput) => scheduleShows({ ...input, dryRun: false }),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useUpdateShow(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateShowInput }) => updateShow(id, input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useDeleteShow(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShow(id),
    onSuccess: (_nothing, id) => {
      forget(client, [
        [...root(userId), 'detail', id],
        ['seat-map', id],
      ]);
      return refreshAfterChange(client, userId);
    },
  });
}

export function useBulkShows(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkShowActionInput) => bulkShows(input),
    onSuccess: (result, input) => {
      if (input.action === 'delete')
        forget(
          client,
          result.succeeded.flatMap((id) => [
            [...root(userId), 'detail', id],
            ['seat-map', id],
          ]),
        );
      return refreshAfterChange(client, userId);
    },
  });
}
