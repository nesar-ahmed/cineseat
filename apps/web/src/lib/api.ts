import type {
  AuthResponse,
  Avatar,
  ChangePasswordInput,
  LoginInput,
  MeResponse,
  Movie,
  Paginated,
  PublicUser,
  SignupInput,
  UpdateProfileInput,
} from '@cineseat/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * One typed API client for the whole app (guideline section 9).
 * `credentials: 'include'` is what carries the httpOnly session cookie; the
 * token itself is never visible to page JavaScript.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

// Endpoints arrive with each build phase.
export const getHealth = () => api<{ status: string }>('/health');
export const getMovies = () => api<Paginated<Movie>>('/movies');

// ── Phase 1: auth and profiles ──────────────────────────────────────────────
export const signup = (input: SignupInput) => api<AuthResponse>('/auth/signup', json(input));
export const login = (input: LoginInput) => api<AuthResponse>('/auth/login', json(input));
export const logout = () => api<void>('/auth/logout', { method: 'POST' });
export const getMe = () => api<MeResponse>('/auth/me');
export const updateProfile = (input: UpdateProfileInput) =>
  api<PublicUser>('/users/me', { ...json(input), method: 'PATCH' });
export const changePassword = (input: ChangePasswordInput) =>
  api<void>('/users/me/password', json(input));
export const uploadAvatar = (file: File | Blob) => {
  const form = new FormData();
  form.append('file', file);
  return api<Avatar>('/users/me/avatar', { method: 'POST', body: form });
};
export const listUsers = (query?: { page?: number; pageSize?: number; search?: string; role?: string }) =>
  api<Paginated<PublicUser>>(`/users${new URLSearchParams((query ?? {}) as Record<string, string>).toString()}`);
