'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { InvoiceStatus } from '@cineseat/shared';
import { ApiClientError, getInvoice, listInvoices } from '../../lib/api';

/** Invoices per page of the list. */
export const INVOICES_PAGE_SIZE = 12;

/** The signed-in buyer's invoices, newest settled first — optionally one status. */
export function useInvoices(page: number, status?: InvoiceStatus) {
  return useQuery({
    queryKey: ['invoices', 'mine', status ?? 'ALL', page],
    queryFn: () =>
      listInvoices({ page, pageSize: INVOICES_PAGE_SIZE, ...(status ? { status } : {}) }),
    placeholderData: keepPreviousData,
  });
}

/** How many invoices there are (one row asked for; `total` read). */
export function useInvoiceCount(status?: InvoiceStatus) {
  return useQuery({
    queryKey: ['invoices', 'mine', 'count', status ?? 'ALL'],
    queryFn: () => listInvoices({ page: 1, pageSize: 1, ...(status ? { status } : {}) }),
  });
}

/** One invoice. A 404 means "no invoice for this booking" — not worth retrying. */
export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id),
    retry: (count, error) => !isMissing(error) && count < 2,
  });
}

export const isMissing = (error: unknown) =>
  error instanceof ApiClientError && error.status === 404;
