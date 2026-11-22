'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdminHistoryEntry, AdminScreen, AdminTheaterDetail } from '@cineseat/shared';
import {
  BuildingIcon,
  CalendarIcon,
  CopyIcon,
  LockIcon,
  MapPinIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  ScreenIcon,
  SeatIcon,
  TicketIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { ApiClientError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { count } from '../dashboard/format';
import { ADMIN_ROUTES, adminBookingsHref, adminScheduleHref, adminShowsHref } from '../links';
import { ShowList } from '../shows/show-list';
import { useToast } from '../toaster';
import { OccupancyBar, Tag } from '../ui/bits';
import { percent, plural, showLabel } from '../ui/format';
import { CategoryLegend, HallMap, categoryOfRow } from '../ui/hall-map';
import {
  BackLink,
  Card,
  DetailSkeleton,
  Figure,
  HistoryCard,
  LoadError,
  MissingPage,
  fieldList,
} from '../ui/page-kit';
import { useAdminTheater } from './queries';
import { DeleteScreenDialog, DeleteTheaterDialog } from './theater-actions';
import { TheaterDialog } from './theater-dialog';
import { ScreenDialog } from './screen-dialog';

/** `/admin/theaters/:id` */
export function AdminTheaterDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const query = useAdminTheater(user?.id, id);
  if (query.isPending) return <DetailSkeleton label="Loading the theater" poster={false} />;
  if (query.error instanceof ApiClientError && query.error.status === 404)
    return (
      <MissingPage
        icon={BuildingIcon}
        title="Theater not found"
        backHref={ADMIN_ROUTES.theaters}
        backLabel="Back to theaters"
      />
    );
  if (query.isError)
    return (
      <LoadError
        what="theater"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return <Detail theater={query.data} />;
}

type ScreenDialogState = { mode: 'add' } | { mode: 'edit'; screen: AdminScreen } | null;

function Detail({ theater }: { theater: AdminTheaterDetail }) {
  const router = useRouter();
  const now = useNow(60_000);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [screenDialog, setScreenDialog] = useState<ScreenDialogState>(null);
  const [deletingScreen, setDeletingScreen] = useState<AdminScreen | null>(null);
  const { stats, constraints } = theater;
  const hasScreens = theater.screens.length > 0;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(theater.id);
      toast({ tone: 'info', message: 'Theater id copied' });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select the id instead' });
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <BackLink href={ADMIN_ROUTES.theaters}>Theaters</BackLink>
      </div>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">{theater.city}</p>
          <h1 className="mt-1 font-display text-3xl text-ink-50 sm:text-4xl">{theater.name}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-400">
            <MapPinIcon className="h-4 w-4 shrink-0" />
            {theater.address}, {theater.city}
          </p>
          {theater.amenities.length ? (
            <p className="mt-3 flex flex-wrap gap-1.5">
              {theater.amenities.map((amenity) => (
                <Tag key={amenity}>{amenity}</Tag>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost py-2.5">
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
          {hasScreens ? (
            <Link href={adminScheduleHref({ theater: theater.id })} className="btn-primary py-2.5">
              <CalendarIcon className="h-4 w-4" />
              Schedule shows
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setScreenDialog({ mode: 'add' })}
              className="btn-primary py-2.5"
            >
              <PlusIcon className="h-4 w-4" />
              Add the first screen
            </button>
          )}
          <Menu
            label={`More actions for ${theater.name}`}
            buttonClassName="btn-icon h-11 w-11"
            items={[
              {
                label: 'All showtimes',
                icon: CalendarIcon,
                href: adminShowsHref({ theater: theater.id }),
              },
              {
                label: 'Bookings',
                icon: TicketIcon,
                href: adminBookingsHref({ theater: theater.id }),
              },
              {
                label: 'Add a screen',
                icon: PlusIcon,
                onSelect: () => setScreenDialog({ mode: 'add' }),
              },
              { label: 'Copy theater id', icon: CopyIcon, onSelect: () => void copyId() },
              'separator',
              {
                label: 'Delete…',
                icon: TrashIcon,
                danger: true,
                onSelect: () => setDeleting(true),
                disabled: !constraints.canDelete,
                hint: constraints.canDelete
                  ? undefined
                  : `Has ${plural(stats.shows, 'show')} on record`,
              },
            ]}
          >
            <MoreIcon className="h-4 w-4" />
          </Menu>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Figure
          icon={CalendarIcon}
          label="Upcoming shows"
          value={count(stats.upcomingShows)}
          note={
            stats.nextShowAt
              ? `Next ${showLabel(stats.nextShowAt)} · today ${plural(theater.today.shows, 'show')}`
              : 'Nothing scheduled'
          }
        />
        <Figure
          icon={SeatIcon}
          label="Sold ahead"
          value={`${percent(stats.occupancy.sold, stats.occupancy.capacity)}%`}
          note={`${count(stats.occupancy.sold)} of ${count(stats.occupancy.capacity)} seats in upcoming shows`}
        />
        <Figure
          icon={TicketIcon}
          label="Tickets sold"
          value={count(stats.ticketsSold)}
          note={stats.shows ? `Across ${plural(stats.shows, 'show')}, all time` : 'No shows yet'}
        />
        <Figure
          icon={ReceiptIcon}
          label="Revenue"
          value={money(stats.revenue)}
          note={`${plural(theater.screens.length, 'screen')} · ${plural(theater.seatCount, 'seat')}`}
        />
      </section>

      <section aria-labelledby="screens-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="screens-title" className="text-lg font-semibold text-ink-50">
              Screens
            </h2>
            <p className="text-xs text-ink-400">
              Seat layouts, what each can show, and how full its coming shows are.
            </p>
          </div>
          {hasScreens ? (
            <button
              type="button"
              onClick={() => setScreenDialog({ mode: 'add' })}
              className="btn-ghost py-2"
            >
              <PlusIcon className="h-4 w-4" />
              Add screen
            </button>
          ) : null}
        </div>
        {hasScreens ? (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {theater.screens.map((screen) => (
              <ScreenCard
                key={screen.id}
                theaterId={theater.id}
                screen={screen}
                onEdit={() => setScreenDialog({ mode: 'edit', screen })}
                onDelete={() => setDeletingScreen(screen)}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
            <ScreenIcon className="mx-auto h-8 w-8 text-ink-400" />
            <p className="mt-3 font-semibold text-ink-100">No screens yet</p>
            <p className="mt-1 text-sm text-ink-400">
              Shows are scheduled on screens. Add one with its seat layout to start.
            </p>
            <button
              type="button"
              onClick={() => setScreenDialog({ mode: 'add' })}
              className="btn-primary mt-5"
            >
              <PlusIcon className="h-4 w-4" />
              Add a screen
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card
          title="Next shows"
          subtitle={
            stats.upcomingShows
              ? `The next ${theater.upcoming.length} of ${stats.upcomingShows} · seats sold and held`
              : 'Nothing scheduled'
          }
          action={
            stats.shows ? (
              <Link
                href={adminShowsHref({ theater: theater.id })}
                className="text-sm font-semibold text-gold-300 hover:text-gold-200"
              >
                All showtimes
              </Link>
            ) : null
          }
        >
          <ShowList
            shows={theater.upcoming}
            venue="screen"
            empty={
              hasScreens
                ? 'No shows coming up here. Schedule some from the Showtimes section.'
                : 'Add a screen, then schedule its shows.'
            }
          />
        </Card>
        <HistoryCard
          entries={theater.history}
          now={now}
          describe={describe}
          empty="No changes recorded yet. Edits and screen changes will show up here."
        />
      </div>

      <TheaterDialog open={editing} onClose={() => setEditing(false)} theater={theater} />
      <ScreenDialog
        open={screenDialog !== null}
        onClose={() => setScreenDialog(null)}
        theaterId={theater.id}
        screen={screenDialog?.mode === 'edit' ? screenDialog.screen : undefined}
      />
      <DeleteTheaterDialog
        theater={
          deleting
            ? { id: theater.id, name: theater.name, blockedReason: constraints.deleteBlockedReason }
            : null
        }
        onClose={() => setDeleting(false)}
        onDeleted={() => router.push(ADMIN_ROUTES.theaters)}
      />
      <DeleteScreenDialog
        screen={
          deletingScreen
            ? {
                id: deletingScreen.id,
                name: deletingScreen.name,
                blockedReason: deletingScreen.constraints.deleteBlockedReason,
              }
            : null
        }
        onClose={() => setDeletingScreen(null)}
      />
    </div>
  );
}

/** One screen: its layout as a small map, what it shows, its figures and limits. */
function ScreenCard({
  theaterId,
  screen,
  onEdit,
  onDelete,
}: {
  theaterId: string;
  screen: AdminScreen;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { stats, constraints, seatCounts } = screen;
  return (
    <li className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-inset">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink-50">
            <span className="truncate">{screen.name}</span>
            {constraints.layoutLocked ? (
              <span title="Layout locked: it has shows">
                <LockIcon className="h-3.5 w-3.5 text-gold-300" aria-label="Layout locked" />
              </span>
            ) : null}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            {screen.formats.map((format) => (
              <Tag key={format}>{format}</Tag>
            ))}
            <span>
              {screen.rows} rows × {screen.cols} · {plural(seatCounts.total, 'seat')}
            </span>
          </p>
        </div>
        <Menu
          label={`Actions for ${screen.name}`}
          items={[
            { label: 'Edit', icon: PencilIcon, onSelect: onEdit },
            { label: 'Showtimes', icon: CalendarIcon, href: adminShowsHref({ screen: screen.id }) },
            {
              label: 'Schedule here',
              icon: PlusIcon,
              href: adminScheduleHref({ theater: theaterId, screen: screen.id }),
            },
            'separator',
            {
              label: 'Delete…',
              icon: TrashIcon,
              danger: true,
              onSelect: onDelete,
              disabled: !constraints.canDelete,
              hint: constraints.canDelete
                ? undefined
                : `Has ${plural(stats.shows, 'show')} on record`,
            },
          ]}
        >
          <MoreIcon className="h-4 w-4" />
        </Menu>
      </div>

      <div className="my-4 rounded-xl bg-ink-950/60 px-3 py-4">
        <HallMap
          size="sm"
          rows={screen.rows}
          cols={screen.cols}
          categoryOf={(row) => categoryOfRow(row, screen)}
          label={`${screen.name}: ${screen.rows} rows of ${screen.cols} seats — ${seatCounts.STANDARD} standard, ${seatCounts.PREMIUM} premium, ${seatCounts.RECLINER} recliner.`}
        />
        <div className="mt-3">
          <CategoryLegend counts={seatCounts} />
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 text-sm">
        <div>
          <dt className="text-xs text-ink-500">Coming up</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink-100">
            {plural(stats.upcomingShows, 'show')}
          </dd>
          <dd className="truncate text-xs text-ink-400">
            {stats.nextShowAt ? `Next ${showLabel(stats.nextShowAt)}` : 'Nothing scheduled'}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-ink-500">Sold ahead</dt>
          <dd>
            <OccupancyBar sold={stats.occupancy.sold} capacity={stats.occupancy.capacity} />
          </dd>
        </div>
      </dl>
      {constraints.formatsInUse.length ? (
        <p className="mt-3 text-xs text-ink-500">
          {constraints.formatsInUse.join(' and ')} in use by upcoming shows.
        </p>
      ) : null}
    </li>
  );
}

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  city: 'city',
  address: 'address',
  amenities: 'amenities',
  formats: 'formats',
  layout: 'seat layout',
};

/** A theater's history line — the theater itself, or one of its screens (by name). */
function describe(entry: AdminHistoryEntry) {
  const fields = entry.fields.length ? (
    <span className="text-ink-300"> {fieldList(entry.fields, FIELD_LABEL)}</span>
  ) : null;
  const screen = <span className="font-semibold">{entry.subject}</span>;
  switch (entry.action) {
    case 'create':
      return 'Added the theater';
    case 'update':
      return <>Edited{fields}</>;
    case 'delete':
      return 'Deleted the theater';
    case 'screen.create':
      return <>Added {screen}</>;
    case 'screen.update':
      return (
        <>
          Edited {screen}
          {entry.fields.length ? ':' : ''}
          {fields}
        </>
      );
    case 'screen.delete':
      return <>Deleted {screen}</>;
    default:
      return entry.action;
  }
}
