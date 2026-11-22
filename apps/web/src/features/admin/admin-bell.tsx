'use client';

import { NotificationBell } from '../notifications/notification-bell';
import { ADMIN_SCOPE } from '../notifications/queries';
import { ADMIN_ROUTES } from './links';

/**
 * The admin top bar's bell: the same bell as the site header's, on the admin
 * category — sign-ups, refunds, sales milestones, offer limits and alerts.
 */
export function AdminNotificationBell({ userId }: { userId: string }) {
  return (
    <NotificationBell
      userId={userId}
      scope={ADMIN_SCOPE}
      allHref={ADMIN_ROUTES.notifications}
      label="Admin notifications"
      emptyText="Sign-ups, refunds, sales milestones and alerts show up here."
    />
  );
}
