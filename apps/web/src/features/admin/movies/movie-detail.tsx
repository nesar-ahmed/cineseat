'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdminMovieDetail } from '@cineseat/shared';
import {
  CalendarIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilmIcon,
  LockIcon,
  MoreIcon,
  PencilIcon,
  ReceiptIcon,
  RefreshIcon,
  StarIcon,
  TicketIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useNow } from '../../../hooks/use-now';
import { ApiClientError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { withArt } from '../../catalog/art';
import { longDate, money, runtime } from '../../catalog/format';
import { movieHref } from '../../catalog/links';
import { PosterArt } from '../../catalog/poster-art';
import { CERTIFICATE_LABEL } from '../../landing/content';
import { count } from '../dashboard/format';
import {
  ADMIN_ROUTES,
  adminBookingsHref,
  adminMovieEditHref,
  adminScheduleHref,
  adminShowHref,
  adminShowsHref,
} from '../links';
import { useToast } from '../toaster';
import { OccupancyBar, Tag } from '../ui/bits';
import { plural, shortDate, shortDateTime, showLabel, sortedFormats } from '../ui/format';
import {
  BackLink,
  Card,
  DetailSkeleton,
  Fact,
  Figure,
  HistoryCard,
  KeyValues,
  LoadError,
  Missing,
  MissingPage,
  fieldList,
} from '../ui/page-kit';
import { STATUS_LABEL, StatusBadge, otherStatus } from './bits';
import { DeleteMovieDialog, useStatusSwitch } from './movie-actions';
import { MovieForm } from './movie-form';
import { PosterPanel } from './poster-panel';
import { useAdminMovie } from './queries';

/** Loads the movie for a page, with loading, not-found and error states inside the admin frame. */
function useMoviePage(id: string) {
  const { user } = useAuth();
  const query = useAdminMovie(user?.id, id);
  const notFound = query.error instanceof ApiClientError && query.error.status === 404;
  return { query, notFound };
}

/** `/admin/movies/:id` */
export function AdminMovieDetailPage({ id }: { id: string }) {
  const { query, notFound } = useMoviePage(id);
  if (query.isPending) return <DetailSkeleton label="Loading the movie" />;
  if (notFound) return <Missing404 />;
  if (query.isError)
    return (
      <LoadError what="movie" message={query.error.message} onRetry={() => void query.refetch()} />
    );
  return <Detail movie={query.data} />;
}

/** `/admin/movies/:id/edit` */
export function EditMoviePage({ id }: { id: string }) {
  const { query, notFound } = useMoviePage(id);
  if (query.isPending) return <DetailSkeleton label="Loading the movie" />;
  if (notFound) return <Missing404 />;
  if (query.isError)
    return (
      <LoadError what="movie" message={query.error.message} onRetry={() => void query.refetch()} />
    );
  return <MovieForm mode="edit" movie={query.data} constraints={query.data.constraints} />;
}

const Missing404 = () => (
  <MissingPage
    icon={FilmIcon}
    title="Movie not found"
    backHref={ADMIN_ROUTES.movies}
    backLabel="Back to movies"
  />
);

/** `/admin/movies/new` */
export function NewMoviePage() {
  return <MovieForm mode="create" />;
}

function Detail({ movie }: { movie: AdminMovieDetail }) {
  const router = useRouter();
  const now = useNow(60_000);
  const { toast } = useToast();
  const { switchStatus, pendingId } = useStatusSwitch();
  const [deleting, setDeleting] = useState(false);
  const { stats, constraints } = movie;
  const to = otherStatus(movie.status);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(movie.id);
      toast({ tone: 'info', message: 'Movie id copied' });
    } catch {
      toast({ tone: 'error', message: 'Couldn’t copy — select the id instead' });
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <BackLink href={ADMIN_ROUTES.movies}>Movies</BackLink>
      </div>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <PosterArt
          movie={withArt(movie)}
          credit
          className="aspect-[2/3] w-32 shrink-0 rounded-2xl shadow-lift ring-1 ring-white/10 sm:w-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {pendingId === movie.id ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                <RefreshIcon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                Updating…
              </span>
            ) : (
              <StatusBadge status={movie.status} />
            )}
            <Tag title={CERTIFICATE_LABEL[movie.certificate]}>{movie.certificate}</Tag>
            {sortedFormats(movie.formats).map((format) => (
              <Tag key={format}>{format}</Tag>
            ))}
          </div>
          <h1 className="mt-3 font-display text-3xl text-ink-50 sm:text-4xl">{movie.title}</h1>
          {movie.tagline ? (
            <p className="mt-1 font-display text-lg italic text-ink-300">{movie.tagline}</p>
          ) : null}
          <p className="mt-2 text-sm text-ink-400">
            {movie.genres.join(', ')} · {movie.language} · {runtime(movie.durationMin)} ·{' '}
            {movie.status === 'COMING_SOON' ? 'Releases' : 'Released'} {longDate(movie.releaseDate)}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={adminMovieEditHref(movie.id)} className="btn-primary py-2.5">
              <PencilIcon className="h-4 w-4" />
              Edit
            </Link>
            <button
              type="button"
              onClick={() => switchStatus(movie)}
              disabled={pendingId === movie.id}
              className="btn-ghost py-2.5 disabled:opacity-50"
            >
              <RefreshIcon className="h-4 w-4" />
              Move to {STATUS_LABEL[to]}
            </button>
            <Link href={adminScheduleHref({ movie: movie.id })} className="btn-ghost py-2.5">
              <CalendarIcon className="h-4 w-4" />
              Schedule shows
            </Link>
            <Menu
              label={`More actions for “${movie.title}”`}
              buttonClassName="btn-icon h-11 w-11"
              items={[
                {
                  label: 'View on site',
                  icon: ExternalLinkIcon,
                  href: movieHref(movie.id),
                  external: true,
                },
                {
                  label: 'Bookings',
                  icon: TicketIcon,
                  href: adminBookingsHref({ movie: movie.id }),
                },
                { label: 'Copy movie id', icon: CopyIcon, onSelect: () => void copyId() },
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
          {to === 'COMING_SOON' && stats.upcomingShows ? (
            <p className="mt-2 text-xs text-ink-500">
              Moving it to Coming soon keeps its {plural(stats.upcomingShows, 'upcoming show')} on
              sale.
            </p>
          ) : null}
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Figure
          icon={CalendarIcon}
          label="Upcoming shows"
          value={count(stats.upcomingShows)}
          note={
            stats.nextShowAt
              ? `Next: ${showLabel(stats.nextShowAt)}`
              : movie.status === 'COMING_SOON'
                ? 'Not scheduled yet'
                : 'None scheduled'
          }
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
          note={
            stats.ticketsSold
              ? `${money(Math.round(stats.revenue / stats.ticketsSold))} per ticket`
              : 'Successful payments'
          }
        />
        {movie.rating !== null ? (
          <Figure
            icon={StarIcon}
            label="Audience rating"
            value={`${movie.rating.toFixed(1)} / 5`}
            note={`${count(movie.votes)} ratings`}
          />
        ) : (
          <Figure
            icon={StarIcon}
            label="Interested"
            value={count(movie.interested)}
            note="Watchlist saves · no ratings yet"
          />
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <UpcomingShows movie={movie} />
          <Card title="Details" subtitle="As the site shows them">
            <div className="px-5 pb-5 sm:px-6">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-200">
                {movie.description}
              </p>
              <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-white/[0.06] pt-5 text-sm sm:grid-cols-2">
                <Fact label="Genres">
                  {movie.genres.map((genre, index) => (
                    <span key={genre}>
                      {index ? ', ' : ''}
                      {genre}
                      {index === 0 ? <span className="text-ink-500"> (primary)</span> : null}
                    </span>
                  ))}
                </Fact>
                <Fact label="Language">{movie.language}</Fact>
                <Fact label="Certificate">
                  {movie.certificate} · {CERTIFICATE_LABEL[movie.certificate]}
                </Fact>
                <Fact label="Released in">{sortedFormats(movie.formats).join(', ')}</Fact>
                <Fact label="Running time">
                  {runtime(movie.durationMin)} ({movie.durationMin} min)
                </Fact>
                <Fact label="Release date">{longDate(movie.releaseDate)}</Fact>
                <Fact label="Director">{movie.director ?? <Missing />}</Fact>
                <Fact label="Cast">{movie.cast.length ? movie.cast.join(', ') : <Missing />}</Fact>
                <Fact label="Trailer">
                  {movie.trailerUrl ? (
                    <a
                      href={movie.trailerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-gold-300 hover:text-gold-200"
                    >
                      <span className="truncate">
                        {movie.trailerUrl.replace(/^https?:\/\//, '')}
                      </span>
                      <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    <Missing />
                  )}
                </Fact>
                <Fact label="Popularity">{count(movie.popularity)}</Fact>
                <Fact label="Added">{shortDateTime(movie.createdAt)}</Fact>
                <Fact label="Last updated">{shortDateTime(movie.updatedAt)}</Fact>
                <Fact label="Movie id" wide>
                  <span className="flex items-center gap-2">
                    <code className="min-w-0 truncate font-mono text-xs text-ink-300">
                      {movie.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyId()}
                      aria-label="Copy movie id"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </Fact>
              </dl>
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <PosterPanel movie={movie} />
          <Limits movie={movie} />
          <HistoryCard
            entries={movie.history}
            now={now}
            empty="No changes recorded yet. Edits, status moves and poster changes will show up here."
            describe={(entry) => (
              <>
                {ACTION_LABEL[entry.action] ?? entry.action}
                {entry.fields.length ? (
                  <span className="text-ink-300"> {fieldList(entry.fields, FIELD_LABEL)}</span>
                ) : null}
              </>
            )}
          />
        </aside>
      </div>

      <DeleteMovieDialog
        movie={deleting ? { ...movie, shows: stats.shows } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => router.push(ADMIN_ROUTES.movies)}
      />
    </div>
  );
}

function UpcomingShows({ movie }: { movie: AdminMovieDetail }) {
  const { upcoming, stats } = movie;
  return (
    <Card
      title="Upcoming shows"
      action={
        stats.shows ? (
          <Link
            href={adminShowsHref({ movie: movie.id })}
            className="text-sm font-semibold text-gold-300 hover:text-gold-200"
          >
            All showtimes
          </Link>
        ) : null
      }
      subtitle={
        stats.upcomingShows
          ? `The next ${upcoming.length} of ${stats.upcomingShows} · seats sold and held`
          : 'Nothing scheduled'
      }
    >
      {upcoming.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-400 sm:px-6">
          {movie.status === 'COMING_SOON'
            ? `Shows can start from ${shortDate(movie.releaseDate)}, its release day.`
            : 'No shows are scheduled. It stays listed under Now showing without showtimes.'}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {upcoming.map((show) => (
            <li key={show.id}>
              <Link
                href={adminShowHref(show.id)}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-6"
              >
                {/* Phones: the venue goes under the time; wider: side by side. */}
                <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                  <div className="sm:w-36 sm:shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-ink-50">
                      {showLabel(show.startsAt)}
                    </p>
                    <p className="hidden text-xs text-ink-400 sm:block">
                      {show.format} · {show.language}
                    </p>
                  </div>
                  <div className="min-w-0 sm:flex-1">
                    <p className="truncate text-sm text-ink-100">{show.theater}</p>
                    <p className="truncate text-xs text-ink-400">
                      {show.screen} · {show.city}
                      <span className="sm:hidden"> · {show.format}</span>
                    </p>
                  </div>
                </div>
                <div className="w-28 shrink-0 sm:w-40">
                  <OccupancyBar sold={show.sold} held={show.held} capacity={show.capacity} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** What the schedule still allows — the same limits the API applies to edits. */
function Limits({ movie }: { movie: AdminMovieDetail }) {
  const { constraints } = movie;
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Formats',
      value: constraints.formatsInUse.length
        ? `${constraints.formatsInUse.join(' and ')} in use by upcoming shows`
        : 'Any can be removed',
    },
    {
      label: 'Release day',
      value: constraints.latestReleaseDate
        ? `On or before ${shortDate(constraints.latestReleaseDate)}`
        : 'Any day',
    },
    {
      label: 'Running time',
      value:
        constraints.maxDurationMin !== null
          ? `Up to ${constraints.maxDurationMin} min`
          : 'Up to 600 min',
    },
    {
      label: 'Delete',
      value: constraints.canDelete
        ? 'Allowed — it has no shows'
        : `Not while it has ${plural(movie.stats.shows, 'show')}`,
    },
  ];
  return (
    <Card title="Schedule limits" subtitle="What edits its shows still allow" icon={LockIcon}>
      <KeyValues rows={rows} />
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Added the movie',
  update: 'Edited',
  poster: 'Uploaded a poster',
  'poster.remove': 'Removed the poster',
  delete: 'Deleted the movie',
};

/** Field names as the form calls them. */
const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  tagline: 'tagline',
  description: 'description',
  genres: 'genres',
  language: 'language',
  durationMin: 'running time',
  releaseDate: 'release date',
  certificate: 'certificate',
  formats: 'formats',
  director: 'director',
  cast: 'cast',
  trailerUrl: 'trailer',
  status: 'status',
};
