'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateHoldInput, Hold } from '@cineseat/shared';
import { ApiClientError, getCurrentHold, getSeatMap, placeHold, releaseHold } from '../../lib/api';

/** How often an open seat map asks for fresh seat states (other buyers hold and release). */
export const SEAT_MAP_REFRESH_MS = 10_000;

export const seatMapKey = (showId: string) => ['seat-map', showId] as const;
/** Per user, so signing out or in never shows someone else's hold. */
export const currentHoldKey = (userId: string | null) => ['hold', 'current', userId] as const;

/** The live seat map: refreshed every few seconds and whenever the tab regains focus. */
export function useSeatMap(showId: string) {
  return useQuery({
    queryKey: seatMapKey(showId),
    queryFn: () => getSeatMap(showId),
    staleTime: 0,
    refetchInterval: SEAT_MAP_REFRESH_MS,
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });
}

/** The signed-in buyer's hold (at most one, on any show), or null. */
export function useCurrentHold(userId: string | null) {
  return useQuery({
    queryKey: currentHoldKey(userId),
    queryFn: getCurrentHold,
    enabled: userId !== null,
    staleTime: 30_000,
    placeholderData: undefined,
  });
}

/** Reserve seats (replacing the buyer's previous hold); the seat map refreshes either way. */
export function usePlaceHold(showId: string, userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHoldInput) => placeHold(input),
    onSuccess: (hold) => queryClient.setQueryData<Hold | null>(currentHoldKey(userId), hold),
    onSettled: () => queryClient.invalidateQueries({ queryKey: seatMapKey(showId) }),
  });
}

/** Give the seats back. A hold that already ran out (404) counts as released. */
export function useReleaseHold(showId: string, userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await releaseHold(id);
      } catch (error) {
        if (!(error instanceof ApiClientError && error.status === 404)) throw error;
      }
    },
    onSuccess: () => queryClient.setQueryData<Hold | null>(currentHoldKey(userId), null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: seatMapKey(showId) }),
  });
}
