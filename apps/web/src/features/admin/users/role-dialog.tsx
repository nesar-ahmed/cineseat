'use client';

import type { UserRole } from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { ShieldIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import { useChangeUserRole } from './queries';

export type RoleTarget = { id: string; name: string; role: UserRole };

/** Your own account: the server says the same (409), the dialog says it first. */
const SELF = 'You can’t change your own role — another admin has to.';

/**
 * Gives an account admin access, or takes it away, after a confirmation that
 * says what it means. `lockedReason` (from the account's page) explains why it
 * cannot be done — your own account, or the only admin — and then only Close
 * is offered; from a list, the server's answer is shown instead.
 */
export function RoleDialog({
  account,
  lockedReason = null,
  onClose,
}: {
  /** The account to change (null: closed). */
  account: RoleTarget | null;
  lockedReason?: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useChangeUserRole(user?.id);
  const promote = account?.role === 'USER';
  const locked = account && account.id === user?.id ? SELF : lockedReason;

  const close = () => {
    mutation.reset();
    onClose();
  };

  return (
    <ConfirmDialog
      open={account !== null}
      onClose={close}
      icon={ShieldIcon}
      tone={promote ? 'default' : 'danger'}
      title={
        account
          ? promote
            ? `Make ${account.name} an admin?`
            : `Remove ${account.name}’s admin access?`
          : ''
      }
      description={
        locked
          ? locked
          : promote
            ? 'They get the whole admin panel: the catalog and showtimes, every booking and payment, and these accounts — including changing roles. It applies at once, and they are told in their notifications.'
            : 'The admin panel closes for them at once. Their account, bookings and tickets stay as they are, and they are told in their notifications.'
      }
      disabled={Boolean(locked)}
      confirmLabel={promote ? 'Make admin' : 'Remove admin access'}
      busyLabel="Saving…"
      busy={mutation.isPending}
      error={mutation.error?.message}
      onConfirm={() => {
        if (!account) return;
        const role: UserRole = promote ? 'ADMIN' : 'USER';
        mutation.mutate(
          { id: account.id, role },
          {
            onSuccess: () => {
              toast({
                message: promote
                  ? `${account.name} is now an admin`
                  : `${account.name} is no longer an admin`,
              });
              mutation.reset();
              onClose();
            },
          },
        );
      }}
    />
  );
}
