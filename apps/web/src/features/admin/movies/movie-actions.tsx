'use client';

import { useCallback } from 'react';
import type { MovieStatus } from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { TrashIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import { plural } from '../ui/format';
import { STATUS_LABEL, otherStatus } from './bits';
import { useDeleteMovie, useSetMovieStatus } from './queries';

type MovieRef = { id: string; title: string; status: MovieStatus };

/**
 * Moves a movie to the other status at once — no dialog: it is one click to
 * undo, and the toast offers exactly that.
 */
export function useStatusSwitch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useSetMovieStatus(user?.id);
  const { mutate } = mutation;

  const switchStatus = useCallback(
    (movie: MovieRef, to: MovieStatus = otherStatus(movie.status)) => {
      const fail = (error: Error) =>
        toast({ tone: 'error', message: 'Couldn’t change the status', detail: error.message });
      mutate(
        { id: movie.id, status: to },
        {
          onError: fail,
          onSuccess: () =>
            toast({
              message: `“${movie.title}” moved to ${STATUS_LABEL[to]}`,
              action: {
                label: 'Undo',
                onClick: () =>
                  mutate(
                    { id: movie.id, status: movie.status },
                    {
                      onError: fail,
                      onSuccess: () =>
                        toast({
                          tone: 'info',
                          message: `“${movie.title}” is back in ${STATUS_LABEL[movie.status]}`,
                        }),
                    },
                  ),
              },
            }),
        },
      );
    },
    [mutate, toast],
  );

  return {
    switchStatus,
    /** The movie whose status is being changed right now, if any. */
    pendingId: mutation.isPending ? mutation.variables?.id : undefined,
  };
}

/**
 * Confirms deleting one movie. A movie with shows cannot be deleted (they carry
 * its bookings and sales); the dialog says so instead of offering the button.
 */
export function DeleteMovieDialog({
  movie,
  onClose,
  onDeleted,
}: {
  /** The movie to delete (null: closed). `shows`: every show it has, past or upcoming. */
  movie: (MovieRef & { shows: number }) | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useDeleteMovie(user?.id);
  const blocked = movie !== null && movie.shows > 0;

  const close = () => {
    mutation.reset();
    onClose();
  };

  return (
    <ConfirmDialog
      open={movie !== null}
      onClose={close}
      icon={TrashIcon}
      tone="danger"
      title={movie ? `Delete “${movie.title}”?` : ''}
      description={
        blocked
          ? `It has ${plural(movie.shows, 'show')} on record. Shows carry bookings and sales history, so a movie with shows can’t be deleted. To take it off sale, move it to Coming soon or stop scheduling it.`
          : 'The movie, its genres, reviews, watchlist saves and poster are deleted. This can’t be undone.'
      }
      disabled={blocked}
      confirmLabel="Delete movie"
      busyLabel="Deleting…"
      busy={mutation.isPending}
      error={mutation.error?.message}
      onConfirm={() => {
        if (!movie) return;
        mutation.mutate(movie.id, {
          onSuccess: () => {
            toast({ message: `“${movie.title}” was deleted` });
            mutation.reset();
            onDeleted?.();
            onClose();
          },
        });
      }}
    />
  );
}
