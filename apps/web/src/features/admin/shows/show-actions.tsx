'use client';

import { ConfirmDialog } from '../../../components/ui/dialog';
import { TrashIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import { useDeleteShow } from './queries';

/**
 * Confirms cancelling (deleting) a show. The API refuses one with tickets, live
 * holds or booking attempts on record; when the reason is known up front (the
 * show's page), the dialog says it instead of offering the button, otherwise
 * the API's answer appears in the dialog.
 */
export function CancelShowDialog({
  show,
  onClose,
  onCancelled,
}: {
  show: { id: string; name: string; blockedReason: string | null } | null;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useDeleteShow(user?.id);
  const close = () => {
    mutation.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={show !== null}
      onClose={close}
      icon={TrashIcon}
      tone="danger"
      title="Cancel this show?"
      description={
        show?.blockedReason ??
        (show
          ? `${show.name}. The show and its seat map are deleted; it disappears from the site at once.`
          : '')
      }
      disabled={Boolean(show?.blockedReason)}
      confirmLabel="Cancel show"
      busyLabel="Cancelling…"
      busy={mutation.isPending}
      error={mutation.error?.message}
      onConfirm={() =>
        show &&
        mutation.mutate(show.id, {
          onSuccess: () => {
            toast({ message: 'Show cancelled', detail: show.name });
            mutation.reset();
            onCancelled?.();
            onClose();
          },
        })
      }
    />
  );
}
