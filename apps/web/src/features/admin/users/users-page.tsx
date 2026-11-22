'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminUserActivity,
  AdminUserSort,
  defaultUserSortOrder,
  type AdminUser,
  type AdminUserList,
} from '@cineseat/shared';
import {
  CopyIcon,
  MoreIcon,
  ReceiptIcon,
  ShieldIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
} from '../../../components/ui/icons';
import { Menu, type MenuItem } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { exactTime, relativeTime } from '../../notifications/time';
import { cinemaDate, count } from '../dashboard/format';
import { adminBookingsHref, adminPaymentsHref, adminUserHref } from '../links';
import { useToast } from '../toaster';
import { Choice, DateRange, FilterDrawer, FilterGroup } from '../ui/filter-kit';
import { shortDate, shortDateTime } from '../ui/format';
import {
  EmptyResults,
  FilterChips,
  FiltersButton,
  ListError,
  ListFooter,
  ListSkeleton,
  RefreshButton,
  SearchBox,
  SortControl,
  SortHeader,
  TabPills,
  nextSort,
  usePageClamp,
  type FilterChip,
} from '../ui/list-kit';
import { PageHeader } from '../ui/page-kit';
import { useUrlQuery } from '../use-url-query';
import { Avatar, RoleBadge } from './bits';
import {
  ACTIVITY_LABEL,
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toSearchParams,
  type FilterPatch,
  type RoleTab,
  type UsersQuery,
} from './list-query';
import { useAdminUsers } from './queries';
import { RoleDialog, type RoleTarget } from './role-dialog';

const TABS: { id: RoleTab; label: string; count: (c: AdminUserList['counts']) => number }[] = [
  { id: 'all', label: 'All', count: (c) => c.all },
  { id: 'USER', label: 'Customers', count: (c) => c.USER },
  { id: 'ADMIN', label: 'Admins', count: (c) => c.ADMIN },
];
const SORTS = AdminUserSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));

/**
 * `/admin/users`: every account — who they are, what they booked and spent,
 * when they last booked — with role tabs, search by name, email or phone,
 * filters, sorting and pages, the whole view in the URL. Each row opens the
 * account; its menu reaches their bookings and payments and gives or takes
 * away admin access (confirmed; never your own, never the last admin).
 */
export function AdminUsersPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const params = useMemo(() => toApiParams(query), [query]);
  const list = useAdminUsers(user?.id, params);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<RoleTarget | null>(null);

  const update = useCallback(
    (patch: Partial<UsersQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '';
  const order = effectiveOrder(query);

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader
        eyebrow="People"
        title="Users"
        description="Every account: what they booked and spent, and who can use the admin panel."
        actions={
          <RefreshButton
            onClick={() => void list.refetch()}
            busy={list.isFetching}
            label="Refresh the list"
          />
        }
      />

      <div className="flex flex-col gap-4">
        <TabPills
          label="Role"
          value={query.tab}
          onChange={(tab) => update({ tab })}
          tabs={TABS.map((tab) => ({ ...tab, count: data ? tab.count(data.counts) : null }))}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search accounts"
            placeholder="Search a name, email or phone"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            <SortControl
              id="users-sort"
              sorts={SORTS}
              sort={query.sort}
              order={order}
              naturalOrder={defaultUserSortOrder}
              orderLabel={orderLabel}
              onChange={update}
            />
          </div>
        </div>
        <FilterChips chips={chipsFor(query, update)} onClearAll={() => update(NO_FILTERS)} />
      </div>

      {list.isPending ? (
        <ListSkeleton label="Loading accounts" height="h-[68px]" />
      ) : list.isError && !data ? (
        <ListError
          what="accounts"
          message={list.error.message}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={UsersIcon}
          filtered={filtered || query.tab !== 'all'}
          onClear={() => update({ ...NO_FILTERS, q: '', tab: 'all' })}
          emptyTitle="No accounts yet"
          emptyText="Accounts appear here as soon as someone signs up."
        />
      ) : (
        <section aria-label="Results">
          <UsersTable
            users={items}
            me={user?.id}
            now={now}
            sort={query.sort}
            order={order}
            onSort={(column) => update(nextSort(column, { sort: query.sort, order }))}
            onRole={setRoleTarget}
            stale={list.isPlaceholderData}
          />
          <ListFooter
            page={data!.page}
            pageSize={data!.pageSize}
            shown={items.length}
            total={data!.total}
            onPageSize={(size) => update({ size })}
            hrefFor={(page) => hrefWith({ page })}
          />
        </section>
      )}

      <FilterDrawer<FilterPatch>
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter accounts"
        value={query}
        empty={NO_FILTERS}
        onApply={update}
      >
        {(draft, set) => (
          <>
            <FilterGroup label="Bookings" hint="Paid bookings">
              <Choice
                options={[
                  ['', 'Anyone'],
                  ...AdminUserActivity.options.map(
                    (value) => [value, ACTIVITY_LABEL[value]] as [string, string],
                  ),
                ]}
                value={draft.activity ?? ''}
                onChange={(value) =>
                  set({ activity: value === '' ? null : (value as AdminUserActivity) })
                }
              />
            </FilterGroup>
            <FilterGroup label="Joined">
              <DateRange
                from={draft.joinedFrom}
                to={draft.joinedTo}
                onChange={({ from, to }) => set({ joinedFrom: from, joinedTo: to })}
              />
            </FilterGroup>
          </>
        )}
      </FilterDrawer>

      <RoleDialog account={roleTarget} onClose={() => setRoleTarget(null)} />
    </div>
  );
}

/** The "⋯" of one account: its pages, copying, and the role. */
function RowMenu({
  account,
  me,
  onRole,
}: {
  account: AdminUser;
  me: string | undefined;
  onRole: (target: RoleTarget) => void;
}) {
  const { toast } = useToast();
  const self = account.id === me;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'info', message: `${what} copied` });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select it instead' });
    }
  };
  const items: MenuItem[] = [
    { label: 'Open account', icon: UserIcon, href: adminUserHref(account.id) },
    { label: 'Their bookings', icon: TicketIcon, href: adminBookingsHref({ user: account.id }) },
    { label: 'Their payments', icon: ReceiptIcon, href: adminPaymentsHref({ user: account.id }) },
    'separator',
    {
      label: account.role === 'ADMIN' ? 'Remove admin access' : 'Make admin',
      icon: ShieldIcon,
      danger: account.role === 'ADMIN',
      disabled: self,
      hint: self ? 'Your own account — another admin has to' : undefined,
      onSelect: () => onRole({ id: account.id, name: account.name, role: account.role }),
    },
    { label: 'Copy email', icon: CopyIcon, onSelect: () => void copy(account.email, 'Email') },
  ];
  return (
    <Menu label={`Actions for ${account.name}`} items={items}>
      <MoreIcon className="h-4 w-4" />
    </Menu>
  );
}

/** The accounts: a table on wide screens, cards below `xl`. Each row opens the account. */
function UsersTable({
  users,
  me,
  now,
  sort,
  order,
  onSort,
  onRole,
  stale,
}: {
  users: AdminUser[];
  me: string | undefined;
  now: number | null;
  sort: AdminUserSort;
  order: 'asc' | 'desc';
  onSort: (sort: AdminUserSort) => void;
  onRole: (target: RoleTarget) => void;
  stale: boolean;
}) {
  const sortProps = { sort, order, onSort };
  const last = (account: AdminUser) =>
    account.stats.lastBookingAt ? (
      <time dateTime={account.stats.lastBookingAt} title={exactTime(account.stats.lastBookingAt)}>
        {now
          ? relativeTime(account.stats.lastBookingAt, now)
          : shortDateTime(account.stats.lastBookingAt)}
      </time>
    ) : (
      <span className="text-ink-500">Never</span>
    );
  const you = (account: AdminUser) =>
    account.id === me ? (
      <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>
    ) : null;

  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
    >
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Accounts</caption>
          <thead className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-ink-400">
            <tr>
              <SortHeader {...sortProps} column="name" className="pl-5">
                Account
              </SortHeader>
              <th scope="col" className="w-28 px-3 py-3 font-medium">
                Role
              </th>
              <SortHeader {...sortProps} column="joined" className="w-32">
                Joined
              </SortHeader>
              <SortHeader {...sortProps} column="bookings" className="w-32" align="right">
                Paid bookings
              </SortHeader>
              <SortHeader {...sortProps} column="spent" className="w-32" align="right">
                Spent
              </SortHeader>
              <SortHeader {...sortProps} column="lastBooking" className="w-40">
                Last booking
              </SortHeader>
              <th scope="col" className="w-16 py-3 pr-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {users.map((account) => (
              <tr
                key={account.id}
                className="relative transition-colors hover:bg-white/[0.03] motion-reduce:transition-none"
              >
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-center gap-3">
                    <Avatar user={account} />
                    <div className="min-w-0">
                      <p className="truncate">
                        <Link
                          href={adminUserHref(account.id)}
                          className="font-medium text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                        >
                          {account.name}
                        </Link>
                        {you(account)}
                      </p>
                      <p className="truncate text-xs text-ink-400">{account.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <RoleBadge role={account.role} />
                </td>
                <td className="px-3 py-3 tabular-nums text-ink-200">
                  <time dateTime={account.createdAt} title={exactTime(account.createdAt)}>
                    {shortDate(cinemaDate(account.createdAt))}
                  </time>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-100">
                  {account.stats.paidBookings ? (
                    count(account.stats.paidBookings)
                  ) : (
                    <span className="text-ink-500">0</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <p className="font-semibold tabular-nums text-ink-50">
                    {money(account.stats.spent)}
                  </p>
                  {account.stats.refunded ? (
                    <p className="text-[11px] tabular-nums text-sky-300">
                      {money(account.stats.refunded)} back
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-200">{last(account)}</td>
                <td className="relative z-10 py-3 pr-5 text-right">
                  <RowMenu account={account} me={me} onRole={onRole} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
        {users.map((account) => (
          <li
            key={account.id}
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 motion-reduce:transition-none"
          >
            <div className="flex items-start gap-3">
              <Avatar user={account} className="h-10 w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <Link
                    href={adminUserHref(account.id)}
                    className="font-semibold text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {account.name}
                  </Link>
                  {you(account)}
                </p>
                <p className="truncate text-xs text-ink-400">{account.email}</p>
              </div>
              <div className="relative z-10 -mr-1 -mt-1">
                <RowMenu account={account} me={me} onRole={onRole} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-xs text-ink-400">
              <RoleBadge role={account.role} />
              <span className="tabular-nums">
                {count(account.stats.paidBookings)} paid ·{' '}
                <span className="font-semibold text-ink-100">{money(account.stats.spent)}</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Joined {shortDate(cinemaDate(account.createdAt))} ·{' '}
              {account.stats.lastBookingAt ? <>last booked {last(account)}</> : 'never booked'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function chipsFor(query: UsersQuery, update: (patch: Partial<UsersQuery>) => void): FilterChip[] {
  const range = (from: string | null, to: string | null) =>
    from && to
      ? from === to
        ? shortDate(from)
        : `${shortDate(from)} – ${shortDate(to)}`
      : from
        ? `from ${shortDate(from)}`
        : `until ${shortDate(to!)}`;
  return [
    ...(query.activity
      ? [
          {
            key: 'activity',
            label: ACTIVITY_LABEL[query.activity],
            remove: () => update({ activity: null }),
          },
        ]
      : []),
    ...(query.joinedFrom || query.joinedTo
      ? [
          {
            key: 'joined',
            label: `Joined ${range(query.joinedFrom, query.joinedTo)}`,
            remove: () => update({ joinedFrom: null, joinedTo: null }),
          },
        ]
      : []),
  ];
}
