'use client';

import { ConfirmDialog } from '../../../components/ui/dialog';
import { TrashIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import { useDeleteScreen, useDeleteTheater } from './queries';

type Target = { id: string; name: string; blockedReason: string | null } | null;

/**
 * Confirms deleting a cinema. One whose screens have shows cannot be deleted
 * (the shows carry bookings and sales); the dialog says why instead.
 */
export function DeleteTheaterDialog({
  theater,
  onClose,
  onDeleted,
}: {
  theater: Target;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useDeleteTheater(user?.id);
  const close = () => {
    mutation.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={theater !== null}
      onClose={close}
      icon={TrashIcon}
      tone="danger"
      title={theater ? `Delete ${theater.name}?` : ''}
      description={
        theater?.blockedReason ??
        'The theater, its screens and their seat layouts are deleted. This can’t be undone.'
      }
      disabled={Boolean(theater?.blockedReason)}
      confirmLabel="Delete theater"
      busyLabel="Deleting…"
      busy={mutation.isPending}
      error={mutation.error?.message}
      onConfirm={() =>
        theater &&
        mutation.mutate(theater.id, {
          onSuccess: () => {
            toast({ message: `${theater.name} was deleted` });
            mutation.reset();
            onDeleted?.();
            onClose();
          },
        })
      }
    />
  );
}

/** Confirms deleting a screen; one with shows cannot be deleted, and the dialog says why. */
export function DeleteScreenDialog({ screen, onClose }: { screen: Target; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useDeleteScreen(user?.id);
  const close = () => {
    mutation.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={screen !== null}
      onClose={close}
      icon={TrashIcon}
      tone="danger"
      title={screen ? `Delete ${screen.name}?` : ''}
      description={
        screen?.blockedReason ?? 'The screen and its seat layout are deleted. This can’t be undone.'
      }
      disabled={Boolean(screen?.blockedReason)}
      confirmLabel="Delete screen"
      busyLabel="Deleting…"
      busy={mutation.isPending}
      error={mutation.error?.message}
      onConfirm={() =>
        screen &&
        mutation.mutate(screen.id, {
          onSuccess: () => {
            toast({ message: `${screen.name} was deleted` });
            mutation.reset();
            onClose();
          },
        })
      }
    />
  );
}
