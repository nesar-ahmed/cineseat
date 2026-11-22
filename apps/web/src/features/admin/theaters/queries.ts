'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateScreenInput,
  CreateTheaterInput,
  UpdateScreenInput,
  UpdateTheaterInput,
} from '@cineseat/shared';
import {
  createScreen,
  createTheater,
  deleteScreen,
  deleteTheater,
  getAdminTheater,
  getAdminTheaters,
  updateScreen,
  updateTheater,
  type AdminTheaterParams,
} from '../../../lib/api';
import { forget, refreshAfterChange } from '../cache';

/**
 * The theaters module's server data, keyed under `['admin', userId]` like every
 * admin view. Each change refreshes the admin views and the public caches
 * (cinema lists, filters, showtimes) through `refreshAfterChange`.
 */
const root = (userId: string | undefined) => ['admin', userId ?? '', 'theaters'] as const;

export function useAdminTheaters(
  userId: string | undefined,
  params: AdminTheaterParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...root(userId), 'list', params],
    queryFn: () => getAdminTheaters(params),
    enabled: Boolean(userId) && (options.enabled ?? true),
    staleTime: 15_000,
  });
}

/**
 * Every cinema with its screens, for pickers and filters (a chain has a handful:
 * one page of 100 holds them all).
 */
export function useAllTheaters(userId: string | undefined) {
  return useAdminTheaters(userId, { sort: 'city', pageSize: 100 });
}

export function useAdminTheater(userId: string | undefined, id: string) {
  return useQuery({
    queryKey: [...root(userId), 'detail', id],
    queryFn: () => getAdminTheater(id),
    enabled: Boolean(userId),
    staleTime: 15_000,
    placeholderData: undefined,
  });
}

export function useCreateTheater(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTheaterInput) => createTheater(input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useUpdateTheater(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTheaterInput }) =>
      updateTheater(id, input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useDeleteTheater(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTheater(id),
    onSuccess: (_nothing, id) => {
      forget(client, [[...root(userId), 'detail', id]]);
      return refreshAfterChange(client, userId);
    },
  });
}

export function useCreateScreen(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ theaterId, input }: { theaterId: string; input: CreateScreenInput }) =>
      createScreen(theaterId, input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useUpdateScreen(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScreenInput }) =>
      updateScreen(id, input),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}

export function useDeleteScreen(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScreen(id),
    onSuccess: () => refreshAfterChange(client, userId),
  });
}
