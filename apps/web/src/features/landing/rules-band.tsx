import { bookingRules } from './demo-data';

/**
 * The rules the API enforces, stated plainly — better than invented praise.
 */
export function RulesBand() {
  return (
    <section aria-label="Booking rules" className="border-y border-ink-800 bg-ink-900/40">
      <div className="container-x grid grid-cols-2 divide-ink-800 lg:grid-cols-4 lg:divide-x">
        {bookingRules.map((rule) => (
          <div key={rule.label} className="px-2 py-6 sm:px-6 lg:border-l lg:border-ink-800 lg:first:border-l-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-500">{rule.label}</p>
            <p className="mt-1.5 font-display text-3xl text-ink-50 tabular-nums">{rule.value}</p>
            <p className="mt-0.5 text-xs text-ink-400">{rule.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
