import type {
  ApiError,
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
 * A failed call that carries the API's documented error shape
 * (`{ statusCode, message, error, … }`), so the UI can show the server's own
 * message — "Email or password is wrong" beats a bare "API 401".
 * `status` is 0 when the request never reached the API (offline, DNS, CORS).
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[], fallback: string) {
    super(messages[0] ?? fallback);
    this.name = 'ApiClientError';
    this.status = status;
    this.messages = messages.length > 0 ? messages : [fallback];
  }

  /** True for the "no valid session cookie" answer, the one callers must expect. */
  get unauthorized(): boolean {
    return this.status === 401;
  }
}

/** Absolute URL for API-relative public paths (avatars are served from `/uploads/…`). */
export const assetUrl = (path: string | null | undefined): string | null =>
  path ? `${API_URL}${path}` : null;

/**
 * One typed API client for the whole app (guideline section 9).
 * `credentials: 'include'` is what carries the httpOnly session cookie; the
 * token itself is never visible to page JavaScript.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...init,
    });
  } catch {
    throw new ApiClientError(0, [], 'Cannot reach the API — is the server running?');
  }
  if (!res.ok) throw new ApiClientError(res.status, await readErrorMessages(res), `API ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** The API always answers failures in one shape; anything else leaves no message to show. */
async function readErrorMessages(res: Response): Promise<string[]> {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (typeof body.message === 'string' && body.message) return [body.message];
    if (Array.isArray(body.message)) return body.message.filter((m): m is string => Boolean(m));
  } catch {
    /* body was not JSON */
  }
  return [];
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
export const listUsers = (query?: { page?: number; pageSize?: number; search?: string; role?: string }) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return api<Paginated<PublicUser>>(`/users${qs ? `?${qs}` : ''}`);
};
