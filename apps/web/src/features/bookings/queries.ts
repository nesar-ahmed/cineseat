'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Booking, BookingStatus } from '@cineseat/shared';
import { ApiClientError, getBooking, listBookings } from '../../lib/api';

export const bookingKey = (id: string) => ['booking', id] as const;

/** While a payment is being confirmed, how often a page asks for news. */
export const CONFIRM_POLL_MS = 1500;

/**
 * One booking. `poll(booking)` says whether to keep asking — while the
 * provider's answer is on its way; otherwise it refreshes on focus like
 * everything else. A 404 is not retried: a hold that ran out unpaid is gone.
 */
export function useBooking(
  id: string,
  poll: (booking: Booking | undefined) => boolean = () => false,
) {
  return useQuery({
    queryKey: bookingKey(id),
    queryFn: () => getBooking(id),
    refetchInterval: (query) => (poll(query.state.data) ? CONFIRM_POLL_MS : false),
    staleTime: 0,
    placeholderData: undefined,
  });
}

/** Bookings per page of the tickets list. */
export const TICKETS_PAGE_SIZE = 10;

/** The signed-in buyer's bookings, newest first — optionally only one status. */
export function useMyBookings(page: number, status?: BookingStatus) {
  return useQuery({
    queryKey: ['bookings', 'mine', status ?? 'ALL', page],
    queryFn: () =>
      listBookings({ page, pageSize: TICKETS_PAGE_SIZE, ...(status ? { status } : {}) }),
    placeholderData: keepPreviousData,
  });
}

/**
 * How many bookings the buyer has (optionally in one status). Asks for a single
 * row and reads `total`, so a count never downloads the list itself. The query
 * also keeps that first booking: with `PENDING` it is the one waiting for payment.
 */
export function useBookingCount(status?: BookingStatus) {
  return useQuery({
    queryKey: ['bookings', 'mine', 'count', status ?? 'ALL'],
    queryFn: () => listBookings({ page: 1, pageSize: 1, ...(status ? { status } : {}) }),
  });
}

/** Where a booking's details live: the ticket page in the user panel. */
export function bookingHref(id: string, options: { confirmed?: boolean } = {}): string {
  return `/account/bookings/${encodeURIComponent(id)}${options.confirmed ? '?confirmed=1' : ''}`;
}

export const isNotFound = (error: unknown) =>
  error instanceof ApiClientError && error.status === 404;
