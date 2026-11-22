import type { PaymentChannel } from '@cineseat/shared';

/** How the buyer paid, as a small mark in the wallet's colour. */
export const CHANNEL: Record<PaymentChannel, { label: string; className: string }> = {
  CARD: { label: 'Card', className: 'bg-white/[0.06] text-ink-200 ring-white/10' },
  BKASH: { label: 'bKash', className: 'bg-pink-500/10 text-pink-300 ring-pink-400/25' },
  NAGAD: { label: 'Nagad', className: 'bg-orange-500/10 text-orange-300 ring-orange-400/25' },
};

export function ChannelMark({ channel }: { channel: PaymentChannel | null }) {
  if (!channel)
    return (
      <span className="inline-flex rounded-md px-1.5 py-px text-[11px] font-semibold text-ink-500 ring-1 ring-inset ring-white/10">
        —
      </span>
    );
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${CHANNEL[channel].className}`}
    >
      {CHANNEL[channel].label}
    </span>
  );
}
