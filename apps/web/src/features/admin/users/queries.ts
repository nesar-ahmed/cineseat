'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@cineseat/shared';
import {
  changeUserRole,
  getAdminUser,
  getAdminUsers,
  type AdminUserParams,
} from '../../../lib/api';
import { refreshAfterChange } from '../cache';

/**
 * The users module's server data, keyed under `['admin', userId]` like every
 * admin view; a role change refreshes them all (lists, the account's page, the
 * dashboard) through `refreshAfterChange`.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'users'] as const;

export function useAdminUsers(userId: string | undefined, params: AdminUserParams) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminUsers(params),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

export function useAdminUser(
  userId: string | undefined,
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...root(userId), 'detail', id],
    queryFn: () => getAdminUser(id),
    enabled: Boolean(userId) && Boolean(id) && (options.enabled ?? true),
    staleTime: 15_000,
    placeholderData: undefined,
  });
}

export function useChangeUserRole(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => changeUserRole(id, role),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}
