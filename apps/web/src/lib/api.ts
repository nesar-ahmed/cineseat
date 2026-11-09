import type { Movie, Paginated } from '@cineseat/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** One typed API client for the whole app (guideline section 9). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

// Endpoints arrive with each build phase; examples:
export const getHealth = () => api<{ status: string }>('/health');
export const getMovies = () => api<Paginated<Movie>>('/movies');
