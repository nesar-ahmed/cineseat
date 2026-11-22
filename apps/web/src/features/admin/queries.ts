'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminDashboard } from '../../lib/api';

/** The dashboard refreshes itself this often while the tab is visible. */
export const DASHBOARD_REFRESH_MS = 60_000;

/** GET /admin/dashboard, scoped to the signed-in admin. */
export function useAdminDashboard(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', userId ?? '', 'dashboard'],
    queryFn: getAdminDashboard,
    enabled: Boolean(userId),
    refetchInterval: DASHBOARD_REFRESH_MS,
    staleTime: 30_000,
  });
}
