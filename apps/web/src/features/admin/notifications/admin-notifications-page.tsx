'use client';

import type { NotificationType } from '@cineseat/shared';
import { CheckIcon } from '../../../components/ui/icons';
import { NotificationInbox } from '../../notifications/notification-inbox';
import {
  ADMIN_SCOPE,
  countCategories,
  countTypes,
  type InboxView,
} from '../../notifications/queries';
import { ADMIN_ROUTES } from '../links';

const SALES: NotificationType[] = [
  'ADMIN_REFUND_ISSUED',
  'ADMIN_SHOW_ALMOST_FULL',
  'ADMIN_SHOW_SOLD_OUT',
  'ADMIN_COUPON_EXHAUSTED',
];
const SIGNUPS: NotificationType[] = ['ADMIN_NEW_USER'];
const ALERTS: NotificationType[] = ['ADMIN_PAYMENT_ALERT', 'ADMIN_SYSTEM_ALERT'];

/** The admin panel's filters: everything, unread, then what an admin acts on. */
const ADMIN_VIEWS: InboxView[] = [
  {
    id: 'all',
    label: 'All',
    empty: 'No admin notifications yet',
    params: { category: ADMIN_SCOPE.categories },
    count: countCategories(ADMIN_SCOPE.categories),
  },
  {
    id: 'unread',
    label: 'Unread',
    empty: 'You’re all caught up',
    params: { status: 'unread', category: ADMIN_SCOPE.categories },
    count: countCategories(ADMIN_SCOPE.categories, 'unread'),
  },
  {
    id: 'sales',
    label: 'Sales',
    empty: 'No sales news',
    params: { type: SALES },
    count: countTypes(SALES),
  },
  {
    id: 'signups',
    label: 'Sign-ups',
    empty: 'No new sign-ups',
    params: { type: SIGNUPS },
    count: countTypes(SIGNUPS),
  },
  {
    id: 'alerts',
    label: 'Alerts',
    empty: 'No alerts',
    params: { type: ALERTS },
    count: countTypes(ALERTS),
  },
];

/**
 * Admin notifications (`/admin/notifications`): the same inbox as the user
 * panel's — read/unread, remove with undo, pages — on the admin category. Each
 * card links to where the admin acts on it.
 */
export function AdminNotificationsPage() {
  return (
    <NotificationInbox
      scope={ADMIN_SCOPE}
      views={ADMIN_VIEWS}
      baseHref={ADMIN_ROUTES.notifications}
      emptyHint="Sign-ups, refunds, sales milestones, offer limits and alerts will show up here."
      header={({ unread, markAllRead, markingAll }) => (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-label">Engage</p>
            <h1 className="mt-1 font-display text-3xl text-ink-50 sm:text-4xl">Notifications</h1>
            <p className="mt-1.5 text-sm text-ink-400">
              {unread === undefined
                ? 'Sign-ups, refunds, sales milestones and alerts.'
                : unread > 0
                  ? `${unread.toLocaleString('en-US')} unread — sign-ups, refunds, sales milestones and alerts.`
                  : 'All read — sign-ups, refunds, sales milestones and alerts.'}
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={!unread || markingAll}
            className="btn-ghost disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckIcon className="h-4 w-4" />
            Mark all as read
          </button>
        </header>
      )}
    />
  );
}
