'use client';

import { useState } from 'react';
import type { AdminShow, BulkShowActionInput } from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { ReceiptIcon, TrashIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { useToast } from '../toaster';
import {
  BarButton,
  BulkBar,
  BulkFailuresDialog,
  SkipNotice,
  type BulkFailure,
} from '../ui/bulk-kit';
import { plural, toMinor } from '../ui/format';
import { lockReason, showName } from './bits';
import { useBulkShows } from './queries';

/**
 * Bulk actions on the selected shows: a new base price for all, or cancel
 * them. Shows that cannot take the action (started, or seats sold or held) are
 * named in the dialog and left out; the API checks each one again, so anything
 * that changed meanwhile is reported with why, and stays selected.
 */
export function ShowBulkBar({
  selected,
  onClear,
  onDone,
}: {
  selected: AdminShow[];
  onClear: () => void;
  onDone: (remaining: string[]) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useBulkShows(user?.id);
  const [dialog, setDialog] = useState<'price' | 'cancel' | null>(null);
  const [price, setPrice] = useState('');
  const [failures, setFailures] = useState<BulkFailure[] | null>(null);

  const locked = selected.filter((show) => lockReason(show) !== null);
  const hasTickets = selected.filter((show) => show.seats.sold > 0 || show.seats.held > 0);
  const skipped = dialog === 'price' ? locked : hasTickets;
  const eligible = selected.filter((show) => !skipped.includes(show));
  const minor = toMinor(price);
  const priceValid = Number.isInteger(minor) && minor >= 0 && minor <= 10_000_000;

  const run = (input: BulkShowActionInput, verb: string) =>
    mutation.mutate(input, {
      onSuccess: (result) => {
        setDialog(null);
        if (result.succeeded.length)
          toast({ message: `${plural(result.succeeded.length, 'show')} ${verb}` });
        if (result.failed.length) setFailures(result.failed);
        onDone(result.failed.map((failure) => failure.id));
      },
      onError: (error) => {
        setDialog(null);
        toast({ tone: 'error', message: 'Nothing was changed', detail: error.message });
      },
    });

  const skipList = skipped.map((show) => ({ id: show.id, label: showName(show) }));

  return (
    <>
      <BulkBar count={selected.length} noun="show" onClear={onClear}>
        <BarButton
          onClick={() => {
            setPrice('');
            setDialog('price');
          }}
          disabled={mutation.isPending}
          icon={ReceiptIcon}
        >
          Change price…
        </BarButton>
        <BarButton
          onClick={() => setDialog('cancel')}
          disabled={mutation.isPending}
          icon={TrashIcon}
          danger
        >
          Cancel…
        </BarButton>
      </BulkBar>

      <ConfirmDialog
        open={dialog === 'price'}
        onClose={() => setDialog(null)}
        icon={ReceiptIcon}
        title={`New base price for ${plural(eligible.length, 'show')}`}
        description="The standard seat’s price; premium and recliner seats keep their surcharge."
        confirmLabel={priceValid ? `Set ৳${Number(price).toLocaleString('en-US')}` : 'Set price'}
        disabled={eligible.length === 0}
        busyLabel="Saving…"
        busy={mutation.isPending}
        onConfirm={() =>
          priceValid &&
          run(
            { action: 'price', ids: eligible.map((show) => show.id), basePrice: minor },
            'repriced',
          )
        }
      >
        {eligible.length ? (
          <label className="block">
            <span className="field-label">Base price (taka)</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                ৳
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={10}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="400"
                className="input pl-8"
                data-autofocus
              />
            </span>
          </label>
        ) : null}
        <SkipNotice
          all={eligible.length === 0}
          items={skipList}
          reason={(one) =>
            one ? 'it has started or has tickets' : 'they have started or have tickets'
          }
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        icon={TrashIcon}
        tone="danger"
        title={`Cancel ${plural(eligible.length, 'show')}?`}
        description="Cancelled shows and their seat maps are deleted and disappear from the site at once."
        confirmLabel={`Cancel ${plural(eligible.length, 'show')}`}
        disabled={eligible.length === 0}
        busyLabel="Cancelling…"
        busy={mutation.isPending}
        onConfirm={() =>
          run({ action: 'delete', ids: eligible.map((show) => show.id) }, 'cancelled')
        }
      >
        <SkipNotice
          all={eligible.length === 0}
          items={skipList}
          reason={(one) => (one ? 'it has tickets' : 'they have tickets')}
        />
      </ConfirmDialog>

      <BulkFailuresDialog failures={failures} noun="show" onClose={() => setFailures(null)} />
    </>
  );
}
