import type {
  AdminBookingDetail,
  AdminBookingList,
  AdminBookingSort,
  AdminDashboard,
  AdminMovieDetail,
  AdminMovieList,
  AdminMoviePosterFilter,
  AdminMovieScheduleFilter,
  AdminMovieSort,
  AdminPaymentList,
  AdminPaymentSort,
  AdminScheduleFilter,
  AdminShowDetail,
  AdminShowList,
  AdminShowSort,
  AdminShowTicketsFilter,
  AdminShowWhen,
  AdminTheaterDetail,
  AdminTheaterList,
  AdminTheaterSort,
  AdminUserActivity,
  AdminUserDetail,
  AdminUserList,
  AdminUserSort,
  ApiError,
  AuthResponse,
  Avatar,
  Booking,
  BookingListQuery,
  BookingStatus,
  BulkMovieActionInput,
  BulkMovieResult,
  BulkResult,
  BulkShowActionInput,
  CatalogFacets,
  CatalogFilters,
  Certificate,
  ChangeEmailInput,
  ChangePasswordInput,
  CheckoutInput,
  CheckoutQuote,
  CreateHoldInput,
  CreateMovieInput,
  CreateScreenInput,
  CreateTheaterInput,
  Hold,
  Invoice,
  InvoiceListQuery,
  InvoiceSummary,
  LoginInput,
  MeResponse,
  MockGatewaySession,
  MockPayInput,
  MockPayResult,
  Movie,
  MovieShowtimes,
  MovieSort,
  MovieStatus,
  Notification as AppNotification,
  NotificationCategory,
  NotificationCounts,
  NotificationReadFilter,
  NotificationType,
  Paginated,
  PaymentChannel,
  PaymentSession,
  PaymentStatus,
  PublicUser,
  ReadAllResult,
  ScheduleShowsInput,
  ScheduleShowsResult,
  ScreenLayout,
  SeatMap,
  ShowAvailability,
  ShowDetail,
  Showtime,
  ShowFormat,
  SignupInput,
  SortOrder,
  Theater,
  TheaterDetail,
  UnreadCount,
  UpdateMovieInput,
  UpdateProfileInput,
  UpdateScreenInput,
  UpdateShowInput,
  UpdateTheaterInput,
  UserRole,
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

/** `?a=1&list=x,y` from an object; empty values and empty lists are left out. */
type QueryValue = string | number | boolean | readonly string[] | null | undefined;
export function toQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const getHealth = () => api<{ status: string }>('/health');

// ── Phase 2: catalog, movies, theaters, shows ─────────────────────────────────
/** Parameters of GET /movies and GET /catalog/facets (lists are OR-ed, filters AND-ed). */
export type MovieParams = {
  search?: string;
  status?: 'NOW_SHOWING' | 'COMING_SOON';
  genre?: readonly string[];
  language?: readonly string[];
  certificate?: readonly string[];
  format?: readonly string[];
  city?: string | null;
  theater?: readonly string[];
  date?: string | null;
  minRating?: number | null;
  minDuration?: number;
  maxDuration?: number;
  sort?: MovieSort;
  page?: number;
  pageSize?: number;
};
export type ShowParams = {
  movie?: readonly string[];
  theater?: readonly string[];
  city?: string | null;
  date?: string | null;
  format?: readonly string[];
  language?: readonly string[];
};

export const getMovies = (params: MovieParams = {}) => api<Paginated<Movie>>(`/movies${toQueryString(params)}`);
export const getMovie = (id: string, init?: RequestInit) =>
  api<Movie>(`/movies/${encodeURIComponent(id)}`, init);
export const getCatalogFacets = (params: MovieParams = {}) =>
  api<CatalogFacets>(`/catalog/facets${toQueryString({ ...params, page: undefined, pageSize: undefined, sort: undefined })}`);
export const getCatalogFilters = () => api<CatalogFilters>('/catalog/filters');
export const getMovieShowtimes = (id: string, params: Pick<ShowParams, 'city' | 'theater' | 'format'> = {}) =>
  api<MovieShowtimes>(`/movies/${encodeURIComponent(id)}/showtimes${toQueryString(params)}`);
export const getShows = (params: ShowParams = {}) => api<Showtime[]>(`/shows${toQueryString(params)}`);
export const getTheaters = (params: { city?: string } = {}) => api<Theater[]>(`/theaters${toQueryString(params)}`);
export const getShow = (id: string, init?: RequestInit) =>
  api<ShowDetail>(`/shows/${encodeURIComponent(id)}`, init);
export const getSeatMap = (showId: string) =>
  api<SeatMap>(`/shows/${encodeURIComponent(showId)}/seats`);

// ── Phase 3: seat holds (signed in) ────────────────────────────────────────────
/** Holds the seats, replacing any hold the buyer already has. 409 names seats that were taken. */
export const placeHold = (input: CreateHoldInput) => api<Hold>('/holds', json(input));
/** The buyer's live hold, or null when there is none (the API answers 404). */
export const getCurrentHold = async (): Promise<Hold | null> => {
  try {
    return await api<Hold>('/holds/current');
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
};
export const releaseHold = (id: string) =>
  api<void>(`/holds/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Phase 3: checkout, bookings and the mock payment gateway ────────────────
/** The price of a hold, optionally with an offer code (400 says why a code does not apply). */
export const quoteCheckout = (holdId: string, input: CheckoutInput) =>
  api<CheckoutQuote>(`/checkout/${encodeURIComponent(holdId)}/quote`, json(input));
/** Opens a payment with the (mock) provider; send the buyer to `redirectUrl`. */
export const startPayment = (holdId: string, input: CheckoutInput) =>
  api<PaymentSession>(`/checkout/${encodeURIComponent(holdId)}/pay`, json(input));
export const getBooking = (id: string) => api<Booking>(`/bookings/${encodeURIComponent(id)}`);
export const listBookings = (query: Partial<BookingListQuery> = {}) =>
  api<Paginated<Booking>>(`/bookings${toQueryString(query)}`);

// ── Invoices (one per booking that money reached) ─────────────────────────────
export const listInvoices = (query: Partial<InvoiceListQuery> = {}) =>
  api<Paginated<InvoiceSummary>>(`/invoices${toQueryString(query)}`);
export const getInvoice = (id: string) => api<Invoice>(`/invoices/${encodeURIComponent(id)}`);

// ── Admin panel (ADMIN only; the API answers 403 to anyone else) ─────────────
export const getAdminDashboard = () => api<AdminDashboard>('/admin/dashboard');

/** Parameters of GET /admin/movies (lists are OR-ed, filters AND-ed). */
export type AdminMovieParams = {
  search?: string;
  status?: MovieStatus;
  genre?: readonly string[];
  language?: readonly string[];
  certificate?: readonly Certificate[];
  /** Formats the movie is released in. */
  format?: readonly ShowFormat[];
  schedule?: AdminMovieScheduleFilter;
  poster?: AdminMoviePosterFilter;
  releasedFrom?: string;
  releasedTo?: string;
  sort?: AdminMovieSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
const movie = (id: string) => `/movies/${encodeURIComponent(id)}`;
export const getAdminMovies = (params: AdminMovieParams = {}) =>
  api<AdminMovieList>(`/admin/movies${toQueryString(params)}`);
export const getAdminMovie = (id: string) =>
  api<AdminMovieDetail>(`/admin/movies/${encodeURIComponent(id)}`);
export const createMovie = (input: CreateMovieInput) => api<Movie>('/movies', json(input));
/** Only the fields sent change; 409 names a field whose change would break the schedule. */
export const updateMovie = (id: string, input: UpdateMovieInput) =>
  api<Movie>(movie(id), { ...json(input), method: 'PATCH' });
/** 409 while the movie has shows. */
export const deleteMovie = (id: string) => api<void>(movie(id), { method: 'DELETE' });
export const uploadMoviePoster = (id: string, file: File | Blob) => {
  const form = new FormData();
  form.append('file', file);
  return api<Movie>(`${movie(id)}/poster`, { method: 'POST', body: form });
};
export const removeMoviePoster = (id: string) =>
  api<Movie>(`${movie(id)}/poster`, { method: 'DELETE' });
/** One action on several movies; each succeeds or fails on its own. */
export const bulkMovies = (input: BulkMovieActionInput) =>
  api<BulkMovieResult>('/movies/bulk', json(input));

/** Parameters of GET /admin/theaters. */
export type AdminTheaterParams = {
  search?: string;
  city?: readonly string[];
  amenity?: readonly string[];
  /** Has a screen that can show any of these. */
  format?: readonly ShowFormat[];
  schedule?: AdminScheduleFilter;
  sort?: AdminTheaterSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
const theater = (id: string) => `/theaters/${encodeURIComponent(id)}`;
const screen = (id: string) => `/screens/${encodeURIComponent(id)}`;
export const getAdminTheaters = (params: AdminTheaterParams = {}) =>
  api<AdminTheaterList>(`/admin/theaters${toQueryString(params)}`);
export const getAdminTheater = (id: string) =>
  api<AdminTheaterDetail>(`/admin/theaters/${encodeURIComponent(id)}`);
/** 409 `name:` when the name is taken; the city takes the spelling other cinemas use. */
export const createTheater = (input: CreateTheaterInput) =>
  api<TheaterDetail>('/theaters', json(input));
export const updateTheater = (id: string, input: UpdateTheaterInput) =>
  api<TheaterDetail>(theater(id), { ...json(input), method: 'PATCH' });
/** 409 while any of its screens has shows. */
export const deleteTheater = (id: string) => api<void>(theater(id), { method: 'DELETE' });
export const createScreen = (theaterId: string, input: CreateScreenInput) =>
  api<ScreenLayout>(`${theater(theaterId)}/screens`, json(input));
/** 409 `name:` / `formats:` / `rows:` when the change is not possible. */
export const updateScreen = (id: string, input: UpdateScreenInput) =>
  api<ScreenLayout>(screen(id), { ...json(input), method: 'PATCH' });
export const deleteScreen = (id: string) => api<void>(screen(id), { method: 'DELETE' });

/** Parameters of GET /admin/shows. */
export type AdminShowParams = {
  search?: string;
  when?: AdminShowWhen;
  from?: string;
  to?: string;
  movie?: readonly string[];
  theater?: readonly string[];
  screen?: readonly string[];
  city?: readonly string[];
  format?: readonly ShowFormat[];
  language?: readonly string[];
  availability?: readonly ShowAvailability[];
  tickets?: AdminShowTicketsFilter;
  sort?: AdminShowSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
const show = (id: string) => `/shows/${encodeURIComponent(id)}`;
export const getAdminShows = (params: AdminShowParams = {}) =>
  api<AdminShowList>(`/admin/shows${toQueryString(params)}`);
export const getAdminShow = (id: string) =>
  api<AdminShowDetail>(`/admin/shows/${encodeURIComponent(id)}`);
/** Every date × time; with `dryRun` nothing is saved. Each slot says why it cannot be, if so. */
export const scheduleShows = (input: ScheduleShowsInput) =>
  api<ScheduleShowsResult>('/shows/batch', json(input));
/** 409 once it has started or seats are held or sold; `startsAt:` / `format:` name a clash. */
export const updateShow = (id: string, input: UpdateShowInput) =>
  api<ShowDetail>(show(id), { ...json(input), method: 'PATCH' });
export const deleteShow = (id: string) => api<void>(show(id), { method: 'DELETE' });
/** Parameters of GET /admin/bookings (lists are OR-ed, filters AND-ed). */
export type AdminBookingParams = {
  search?: string;
  status?: readonly BookingStatus[];
  /** Has a payment in any of these states. */
  payment?: readonly PaymentStatus[];
  movie?: readonly string[];
  theater?: readonly string[];
  show?: readonly string[];
  user?: readonly string[];
  coupon?: readonly string[];
  bookedFrom?: string;
  bookedTo?: string;
  showFrom?: string;
  showTo?: string;
  sort?: AdminBookingSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
export const getAdminBookings = (params: AdminBookingParams = {}) =>
  api<AdminBookingList>(`/admin/bookings${toQueryString(params)}`);
export const getAdminBooking = (id: string) =>
  api<AdminBookingDetail>(`/admin/bookings/${encodeURIComponent(id)}`);

/** Parameters of GET /admin/payments (lists are OR-ed, filters AND-ed). Money in poisha. */
export type AdminPaymentParams = {
  search?: string;
  status?: readonly PaymentStatus[];
  channel?: readonly PaymentChannel[];
  user?: readonly string[];
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: AdminPaymentSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
export const getAdminPayments = (params: AdminPaymentParams = {}) =>
  api<AdminPaymentList>(`/admin/payments${toQueryString(params)}`);

/** Parameters of GET /admin/users. */
export type AdminUserParams = {
  search?: string;
  role?: UserRole;
  activity?: AdminUserActivity;
  joinedFrom?: string;
  joinedTo?: string;
  sort?: AdminUserSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};
export const getAdminUsers = (params: AdminUserParams = {}) =>
  api<AdminUserList>(`/admin/users${toQueryString(params)}`);
export const getAdminUser = (id: string) =>
  api<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);
/** 409 for your own account or the last admin (the message says which). */
export const changeUserRole = (id: string, role: UserRole) =>
  api<PublicUser>(`/users/${encodeURIComponent(id)}/role`, { ...json({ role }), method: 'PATCH' });

/** Cancel or reprice several shows; each succeeds or fails on its own. */
export const bulkShows = (input: BulkShowActionInput) =>
  api<BulkResult>('/shows/bulk', json(input));

// ── In-app notifications (signed in; always the caller's own) ────────────────
/**
 * Parameters of GET /notifications. `category` and `type` lists are each OR-ed
 * (none: any); given together, a notification must match both.
 */
export type NotificationParams = {
  page?: number;
  pageSize?: number;
  status?: NotificationReadFilter;
  category?: readonly NotificationCategory[];
  type?: readonly NotificationType[];
};
export const listNotifications = (params: NotificationParams = {}) =>
  api<Paginated<AppNotification>>(`/notifications${toQueryString(params)}`);
export const getUnreadNotificationCount = (category: readonly NotificationCategory[] = []) =>
  api<UnreadCount>(`/notifications/unread-count${toQueryString({ category })}`);
export const getNotificationCounts = () => api<NotificationCounts>('/notifications/counts');
export const markNotification = (id: string, read: boolean) =>
  api<AppNotification>(`/notifications/${encodeURIComponent(id)}`, {
    ...json({ read }),
    method: 'PATCH',
  });
export const markAllNotificationsRead = (categories?: readonly NotificationCategory[]) =>
  api<ReadAllResult>('/notifications/read-all', json(categories ? { categories } : {}));
export const deleteNotification = (id: string) =>
  api<void>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** The test gateway's hosted page talks to these — no session cookie needed (the ref is the key). */
export const getMockSession = (ref: string) =>
  api<MockGatewaySession>(`/mock-gateway/sessions/${encodeURIComponent(ref)}`, {
    credentials: 'omit',
  });
export const payMockSession = (ref: string, input: MockPayInput) =>
  api<MockPayResult>(`/mock-gateway/sessions/${encodeURIComponent(ref)}/pay`, {
    ...json(input),
    credentials: 'omit',
  });
export const cancelMockSession = (ref: string) =>
  api<MockPayResult>(`/mock-gateway/sessions/${encodeURIComponent(ref)}/cancel`, {
    method: 'POST',
    credentials: 'omit',
  });

/**
 * The message the API attached to one field (`"couponCode: This code has expired."`),
 * without the field prefix — or null when the error is about something else.
 */
export function fieldError(error: unknown, field: string): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const hit = error.messages.find((message) => message.startsWith(`${field}: `));
  return hit ? hit.slice(field.length + 2) : null;
}

// ── Phase 1: auth and profiles ──────────────────────────────────────────────
export const signup = (input: SignupInput) => api<AuthResponse>('/auth/signup', json(input));
export const login = (input: LoginInput) => api<AuthResponse>('/auth/login', json(input));
export const logout = () => api<void>('/auth/logout', { method: 'POST' });
export const getMe = () => api<MeResponse>('/auth/me');
export const updateProfile = (input: UpdateProfileInput) =>
  api<PublicUser>('/users/me', { ...json(input), method: 'PATCH' });
export const changePassword = (input: ChangePasswordInput) =>
  api<void>('/users/me/password', json(input));
export const changeEmail = (input: ChangeEmailInput) =>
  api<PublicUser>('/users/me/email', { ...json(input), method: 'PATCH' });
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
