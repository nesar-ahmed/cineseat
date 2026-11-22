import { z } from 'zod';
import { AdminHistoryEntrySchema, SortOrder } from './admin-common';
import { PublicUserSchema } from './auth';
import { CalendarDateSchema } from './movies';
import { ListQuerySchema, paginatedSchema } from './common';
import { UserRole } from './enums';

/**
 * The users module of the admin panel (ADMIN only): GET /admin/users (every
 * account with what it has booked and spent), GET /admin/users/:id (one
 * account's profile, figures, favourites and history) and
 * PATCH /users/:id/role (make an admin, or take admin access away — audited,
 * never your own, never the last admin). Money is in poisha (৳1 = 100).
 */

export const AdminUserSort = z.enum(['joined', 'name', 'bookings', 'spent', 'lastBooking']);
export type AdminUserSort = z.infer<typeof AdminUserSort>;

/** A–Z for names, newest / biggest first for the rest. */
export function defaultUserSortOrder(sort: AdminUserSort): SortOrder {
  return sort === 'name' ? 'asc' : 'desc';
}

/** `booked`: has at least one paid booking; `never`: has none. */
export const AdminUserActivity = z.enum(['booked', 'never']);
export type AdminUserActivity = z.infer<typeof AdminUserActivity>;

/** GET /admin/users. `search` matches name, email or phone, or an exact account id. */
export const AdminUserListQuerySchema = ListQuerySchema.extend({
  role: UserRole.optional(),
  activity: AdminUserActivity.optional(),
  /** Joined on or after / on or before these cinema days. */
  joinedFrom: CalendarDateSchema.optional(),
  joinedTo: CalendarDateSchema.optional(),
  sort: AdminUserSort.default('joined'),
  order: SortOrder.optional(),
}).refine((q) => !q.joinedFrom || !q.joinedTo || q.joinedFrom <= q.joinedTo, {
  message: 'joinedFrom must not be after joinedTo',
  path: ['joinedFrom'],
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;

/** What an account has done: paid bookings, money in and back, and when it last booked. */
export const AdminUserStatsSchema = z.object({
  paidBookings: z.number().int().min(0),
  spent: z.number().int().min(0),
  refunded: z.number().int().min(0),
  lastBookingAt: z.string().nullable(),
});
export type AdminUserStats = z.infer<typeof AdminUserStatsSchema>;

export const AdminUserSchema = PublicUserSchema.extend({ stats: AdminUserStatsSchema });
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** GET /admin/users answer: a page, plus accounts per role with every other filter applied. */
export const AdminUserListSchema = paginatedSchema(AdminUserSchema).extend({
  counts: z.object({
    all: z.number().int().min(0),
    USER: z.number().int().min(0),
    ADMIN: z.number().int().min(0),
  }),
});
export type AdminUserList = z.infer<typeof AdminUserListSchema>;

/** GET /admin/users/:id */
export const AdminUserDetailSchema = AdminUserSchema.extend({
  stats: AdminUserStatsSchema.extend({
    /** Seats in paid bookings. */
    tickets: z.number().int().min(0),
    /** Paid bookings for shows that have not started. */
    upcoming: z.number().int().min(0),
    /** Bookings that ended without tickets (holds that ran out after a payment attempt). */
    notCompleted: z.number().int().min(0),
    firstBookingAt: z.string().nullable(),
  }),
  /** What the account books most (paid bookings), at most 3 each. */
  favourites: z.object({
    movies: z.array(z.object({ id: z.string(), title: z.string(), bookings: z.number().int() })),
    theaters: z.array(z.object({ id: z.string(), name: z.string(), bookings: z.number().int() })),
  }),
  constraints: z.object({
    /** Not your own account, and never the last admin. */
    canChangeRole: z.boolean(),
    roleLockedReason: z.string().nullable(),
  }),
  /** Role changes, latest first. */
  history: z.array(AdminHistoryEntrySchema),
  updatedAt: z.string(),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;

/** PATCH /users/:id/role (ADMIN) */
export const ChangeUserRoleSchema = z.object({ role: UserRole });
export type ChangeUserRoleInput = z.infer<typeof ChangeUserRoleSchema>;
