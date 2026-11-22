import { CheckIcon } from '../../components/ui/icons';

const STEPS = ['Seats', 'Checkout', 'Payment', 'Tickets'] as const;

/** Where the buyer is: steps before `current` are done; `current` = 4 means all done. */
export function CheckoutSteps({ current }: { current: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Booking progress" className="flex items-center gap-2 text-xs sm:gap-3">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`h-px w-4 sm:w-8 ${done || active ? 'bg-brand-500/60' : 'bg-white/10'}`}
              />
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-1.5 font-semibold ${active ? 'text-ink-50' : done ? 'text-ink-300' : 'text-ink-500'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  done
                    ? 'bg-brand-500 text-white'
                    : active
                      ? 'border border-brand-400 text-brand-200'
                      : 'border border-white/15 text-ink-500'
                }`}
              >
                {done ? <CheckIcon className="h-3 w-3" /> : index + 1}
              </span>
              {/* On phones only the current step is named; the rest are numbered circles. */}
              <span className={active ? '' : 'sr-only sm:not-sr-only'}>{label}</span>
              <span className="sr-only">{done ? ' (done)' : active ? ' (current step)' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
