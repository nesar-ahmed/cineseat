'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking, CheckoutInput, CheckoutQuote } from '@cineseat/shared';
import { ApiClientError, quoteCheckout, startPayment } from '../../lib/api';

/** Checkout: pricing a hold and opening payments. Reading bookings lives in `bookings/queries`. */
export const quoteKey = (holdId: string, code: string | null) =>
  ['checkout-quote', holdId, code] as const;

/** The price for the code that is applied (or none). */
export function useQuote(holdId: string, code: string | null, enabled: boolean) {
  return useQuery({
    queryKey: quoteKey(holdId, code),
    queryFn: () => quoteCheckout(holdId, code ? { couponCode: code } : {}),
    enabled,
    staleTime: 30_000,
    retry: false,
    // Keep the last price on screen while a new code is checked.
    placeholderData: keepPreviousData,
  });
}

/** Check a code before applying it; the price it returns goes straight into the cache. */
export function useApplyCode(holdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => quoteCheckout(holdId, { couponCode: code }),
    onSuccess: (quote: CheckoutQuote, code) =>
      queryClient.setQueryData(quoteKey(holdId, code), quote),
  });
}

export function useStartPayment(holdId: string) {
  return useMutation({
    mutationFn: (input: CheckoutInput) => startPayment(holdId, input),
  });
}

export const isGone = (error: unknown) => error instanceof ApiClientError && error.status === 410;

/** A booking whose hold is still running and can be paid for. */
export function isPayable(booking: Booking, now: number): boolean {
  return (
    booking.status === 'PENDING' &&
    booking.expiresAt !== null &&
    Date.parse(booking.expiresAt) > now
  );
}
