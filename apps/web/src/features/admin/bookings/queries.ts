'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminBooking, getAdminBookings, type AdminBookingParams } from '../../../lib/api';

/**
 * The bookings module's server data (read-only), keyed under `['admin', userId]`
 * like every admin view — so any admin change elsewhere refreshes it too.
 * Bookings move while the page is open (holds lapse, payments arrive): both
 * views refresh on their own.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'bookings'] as const;

export function useAdminBookings(userId: string | undefined, params: AdminBookingParams) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminBookings(params),
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useAdminBooking(userId: string | undefined, id: string) {
  return useQuery({
    queryKey: [...root(userId), 'detail', id],
    queryFn: () => getAdminBooking(id),
    enabled: Boolean(userId),
    staleTime: 10_000,
    // A booking still waiting for its money changes by itself: check often.
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 10_000 : 60_000),
    placeholderData: undefined,
  });
}
