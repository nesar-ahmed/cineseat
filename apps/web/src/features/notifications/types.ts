import type { Notification } from '@cineseat/shared';

/**
 * A notification as the API sends it (GET /notifications): what happened, when,
 * whether it was read, and what it is about — `bookingId`, `showId` or
 * `couponCode` — so each card can link to the right place. Named apart from the
 * browser's own `Notification` API.
 */
export type AppNotification = Notification;
