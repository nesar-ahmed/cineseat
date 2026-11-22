'use client';

import { useState } from 'react';
import type { AdminMovie, BulkMovieActionInput, MovieStatus } from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { RefreshIcon, TrashIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import {
  BarButton,
  BulkBar,
  BulkFailuresDialog,
  SkipNotice,
  type BulkFailure,
} from '../ui/bulk-kit';
import { plural } from '../ui/format';
import { STATUS_LABEL } from './bits';
import { useBulkMovies } from './queries';

/**
 * Bulk actions on the selected movies: move them all to a status, or delete
 * them. Each movie succeeds or fails on its own (the API applies the
 * single-movie rules to each); what could not be done is listed with why, and
 * stays selected.
 */
export function MovieBulkBar({
  selected,
  onClear,
  onDone,
}: {
  selected: AdminMovie[];
  onClear: () => void;
  /** Keep only these selected (the ones that failed). */
  onDone: (remaining: string[]) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useBulkMovies(user?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failures, setFailures] = useState<BulkFailure[] | null>(null);
  const withShows = selected.filter((movie) => movie.stats.shows > 0);

  const run = (input: BulkMovieActionInput, verb: string) =>
    mutation.mutate(input, {
      onSuccess: (result) => {
        setConfirmDelete(false);
        if (result.succeeded.length)
          toast({ message: `${plural(result.succeeded.length, 'movie')} ${verb}` });
        if (result.failed.length)
          setFailures(
            result.failed.map(({ id, title, message }) => ({ id, label: title, message })),
          );
        onDone(result.failed.map((failure) => failure.id));
      },
      onError: (error) => {
        setConfirmDelete(false);
        toast({ tone: 'error', message: 'Nothing was changed', detail: error.message });
      },
    });

  const setStatus = (status: MovieStatus) =>
    run(
      { action: 'status', ids: selected.map((movie) => movie.id), status },
      `moved to ${STATUS_LABEL[status]}`,
    );

  return (
    <>
      <BulkBar count={selected.length} noun="movie" onClear={onClear}>
        <BarButton
          onClick={() => setStatus('NOW_SHOWING')}
          disabled={mutation.isPending}
          icon={RefreshIcon}
        >
          Now showing
        </BarButton>
        <BarButton
          onClick={() => setStatus('COMING_SOON')}
          disabled={mutation.isPending}
          icon={RefreshIcon}
        >
          Coming soon
        </BarButton>
        <BarButton
          onClick={() => setConfirmDelete(true)}
          disabled={mutation.isPending}
          icon={TrashIcon}
          danger
        >
          Delete…
        </BarButton>
      </BulkBar>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        icon={TrashIcon}
        tone="danger"
        title={`Delete ${plural(selected.length, 'movie')}?`}
        description="Deleted movies lose their genres, reviews, watchlist saves and posters. This can’t be undone."
        confirmLabel={`Delete ${plural(selected.length - withShows.length, 'movie')}`}
        disabled={withShows.length === selected.length}
        busyLabel="Deleting…"
        busy={mutation.isPending}
        // Movies with shows were already explained: only the others are sent.
        // The API checks each one again, so a movie scheduled meanwhile is still refused.
        onConfirm={() =>
          run(
            {
              action: 'delete',
              ids: selected.filter((movie) => movie.stats.shows === 0).map((movie) => movie.id),
            },
            'deleted',
          )
        }
      >
        <SkipNotice
          all={withShows.length === selected.length}
          items={withShows.map((movie) => ({
            id: movie.id,
            label: `${movie.title} · ${plural(movie.stats.shows, 'show')}`,
          }))}
          reason={(one) => (one ? 'it has shows' : 'they have shows')}
        />
      </ConfirmDialog>

      <BulkFailuresDialog failures={failures} noun="movie" onClose={() => setFailures(null)} />
    </>
  );
}
