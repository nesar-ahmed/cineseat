import { z } from 'zod';
import { ListQuerySchema, csvList, paginatedSchema, type Paginated } from './common';
import { NotificationType } from './enums';

/**
 * In-app notifications (one contract for both apps).
 *
 * Every notification belongs to one account. Messages for admins are written
 * once per ADMIN account, so each admin reads, keeps or removes their own copy.
 * The API only ever returns the caller's own notifications.
 */

/** How the notification list is grouped and filtered. */
export const NotificationCategory = z.enum(['bookings', 'offers', 'account', 'admin']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

/** The category of every type: the API filters with it, the web app groups with it. */
export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory> = {
  BOOKING_CONFIRMED: 'bookings',
  BOOKING_FAILED: 'bookings',
  BOOKING_CANCELLED: 'bookings',
  REFUNDED: 'bookings',
  HOLD_EXPIRING: 'bookings',
  HOLD_EXPIRED: 'bookings',
  PAYMENT_FAILED: 'bookings',
  SHOW_REMINDER: 'bookings',
  ANNOUNCEMENT: 'offers',
  NEW_COUPON: 'offers',
  WELCOME: 'account',
  ACCOUNT_SECURITY: 'account',
  ADMIN_NEW_USER: 'admin',
  ADMIN_REFUND_ISSUED: 'admin',
  ADMIN_SHOW_ALMOST_FULL: 'admin',
  ADMIN_SHOW_SOLD_OUT: 'admin',
  ADMIN_COUPON_EXHAUSTED: 'admin',
  ADMIN_PAYMENT_ALERT: 'admin',
  ADMIN_SYSTEM_ALERT: 'admin',
};

/** The types in one or more categories, in enum order. */
export const notificationTypesIn = (...categories: NotificationCategory[]): NotificationType[] =>
  NotificationType.options.filter((type) => categories.includes(NOTIFICATION_CATEGORY[type]));

/**
 * What the user panel shows: everything except the `admin` category, which the
 * admin panel will present on its own.
 */
export const USER_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'bookings',
  'offers',
  'account',
];

/** `?category=bookings` or `?category=bookings,offers` — none means every category. */
const CategoryFilter = csvList(NotificationCategory);
/** `?type=ADMIN_SHOW_SOLD_OUT,ADMIN_SHOW_ALMOST_FULL` — none means every type. */
const TypeFilter = csvList(NotificationType);

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationType,
  category: NotificationCategory,
  title: z.string(),
  body: z.string(),
  /** When it was read, ISO UTC; null while unread. */
  readAt: z.string().nullable(),
  createdAt: z.string(),
  /** The booking it is about (confirmed, failed, refunded, reminders, holds about to end…). */
  bookingId: z.string().nullable(),
  /** The show it is about — set where no booking is left to point at (a lapsed hold, a sold-out show). */
  showId: z.string().nullable(),
  /** The offer code it announces, if any. */
  couponCode: z.string().nullable(),
  /** The account it is about (a new sign-up, for admins) — not the one it was sent to. */
  subjectUserId: z.string().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const PaginatedNotificationsSchema = paginatedSchema(NotificationSchema);
export type PaginatedNotifications = Paginated<Notification>;

export const NotificationReadFilter = z.enum(['unread', 'read']);
export type NotificationReadFilter = z.infer<typeof NotificationReadFilter>;

/**
 * GET /notifications — newest first. `status`, `category` and `type` narrow the
 * list; categories and types can each be several (OR-ed), and both together
 * keep what matches both.
 */
export const NotificationListQuerySchema = ListQuerySchema.omit({ search: true }).extend({
  status: NotificationReadFilter.optional(),
  category: CategoryFilter,
  type: TypeFilter,
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

/** GET /notifications/unread-count — optionally only some categories. */
export const UnreadCountQuerySchema = z.object({ category: CategoryFilter });
export type UnreadCountQuery = z.infer<typeof UnreadCountQuerySchema>;

/** GET /notifications/unread-count — small enough to poll for a header badge. */
export const UnreadCountSchema = z.object({ unread: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

const CountSchema = z.object({
  total: z.number().int().min(0),
  unread: z.number().int().min(0),
});

/** GET /notifications/counts — totals for the list's filters, per category and per type. */
export const NotificationCountsSchema = CountSchema.extend({
  categories: z.object({
    bookings: CountSchema,
    offers: CountSchema,
    account: CountSchema,
    admin: CountSchema,
  }),
  /** Every type, zero when there is none. */
  types: z.record(NotificationType, CountSchema),
});
export type NotificationCounts = z.infer<typeof NotificationCountsSchema>;

/** PATCH /notifications/:id */
export const UpdateNotificationSchema = z.object({ read: z.boolean() });
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;

/** POST /notifications/read-all — every unread one, or only those of some categories. */
export const ReadAllNotificationsSchema = z.preprocess(
  (value) => value ?? {},
  z.object({ categories: z.array(NotificationCategory).min(1).max(4).optional() }),
);
export type ReadAllNotificationsInput = z.infer<typeof ReadAllNotificationsSchema>;

export const ReadAllResultSchema = z.object({ updated: z.number().int().min(0) });
export type ReadAllResult = z.infer<typeof ReadAllResultSchema>;

/** Who an announcement goes to. */
export const AnnouncementAudience = z.enum(['ALL', 'USERS', 'ADMINS']);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudience>;

/** POST /notifications/announcements (ADMIN) — news for every account in the audience. */
export const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Title is too short').max(120, 'Title is too long'),
  body: z.string().trim().min(1, 'Write a message').max(1000, 'Message is too long'),
  audience: AnnouncementAudience.default('ALL'),
});
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementSchema>;

export const AnnouncementResultSchema = z.object({
  /** How many accounts received it. */
  recipients: z.number().int().min(0),
});
export type AnnouncementResult = z.infer<typeof AnnouncementResultSchema>;
