'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminPayments, type AdminPaymentParams } from '../../../lib/api';

/**
 * The payments module's server data (read-only), keyed under `['admin', userId]`
 * like every admin view. Payments settle while the page is open (the provider's
 * webhook): the list refreshes on its own.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'payments'] as const;

export function useAdminPayments(
  userId: string | undefined,
  params: AdminPaymentParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminPayments(params),
    enabled: Boolean(userId) && (options.enabled ?? true),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
