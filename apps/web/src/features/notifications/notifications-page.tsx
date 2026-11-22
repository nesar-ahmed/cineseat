'use client';

import { CheckIcon } from '../../components/ui/icons';
import { ACCOUNT_ROUTES } from '../account/links';
import { PanelHeader } from '../account/panel-header';
import { NotificationInbox } from './notification-inbox';
import { USER_SCOPE, countCategories, type InboxView } from './queries';

const ALL = USER_SCOPE.categories;

/** The user panel's filters: everything, unread, then one pill per category. */
const USER_VIEWS: InboxView[] = [
  {
    id: 'all',
    label: 'All',
    empty: 'No notifications yet',
    params: { category: ALL },
    count: countCategories(ALL),
  },
  {
    id: 'unread',
    label: 'Unread',
    empty: 'You’re all caught up',
    params: { status: 'unread', category: ALL },
    count: countCategories(ALL, 'unread'),
  },
  {
    id: 'bookings',
    label: 'Bookings',
    empty: 'No booking updates',
    params: { category: ['bookings'] },
    count: countCategories(['bookings']),
  },
  {
    id: 'offers',
    label: 'Offers & news',
    empty: 'No offers or news',
    params: { category: ['offers'] },
    count: countCategories(['offers']),
  },
  {
    id: 'account',
    label: 'Account',
    empty: 'No account notices',
    params: { category: ['account'] },
    count: countCategories(['account']),
  },
];

/**
 * Notifications in the user panel (`/account/notifications`): booking updates,
 * reminders, offers and account notices — the admin category is left to the
 * admin panel.
 */
export function NotificationsPage() {
  return (
    <NotificationInbox
      scope={USER_SCOPE}
      views={USER_VIEWS}
      baseHref={ACCOUNT_ROUTES.notifications}
      emptyHint="Booking confirmations, reminders and offers will show up here."
      header={({ unread, markAllRead, markingAll }) => (
        <PanelHeader
          trail={[
            { label: 'My account', href: ACCOUNT_ROUTES.overview },
            { label: 'Notifications' },
          ]}
          eyebrow="Inbox"
          title="Notifications"
          description={
            unread === undefined
              ? 'Booking updates, reminders and offers.'
              : unread > 0
                ? `${unread.toLocaleString('en-US')} unread — booking updates, reminders and offers.`
                : 'All read — booking updates, reminders and offers.'
          }
          actions={
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unread || markingAll}
              className="btn-ghost disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckIcon className="h-4 w-4" />
              Mark all as read
            </button>
          }
        />
      )}
    />
  );
}
