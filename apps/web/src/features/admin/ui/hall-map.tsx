import type { SeatCategory } from '@cineseat/shared';

/**
 * A hall seen from the back, screen at the top — the admin's picture of a seat
 * layout. Two uses:
 *
 * - a layout (screen editor, screen cards): seats coloured by category, from
 *   rows × cols and how many premium and recliner rows there are;
 * - a show (show page): seats coloured by state — sold, held, free — with the
 *   category in the row labels.
 *
 * It is a picture, not a control: one `role="img"` with the whole story in its
 * label (the numbers are also written next to it on every page that uses it).
 */
export type SeatState = 'free' | 'held' | 'sold';

/** Back rows recliners, the rows in front of them premium, the rest standard (as the API). */
export function categoryOfRow(
  row: number,
  layout: { rows: number; premiumRows: number; reclinerRows: number },
): SeatCategory {
  if (row > layout.rows - layout.reclinerRows) return 'RECLINER';
  if (row > layout.rows - layout.reclinerRows - layout.premiumRows) return 'PREMIUM';
  return 'STANDARD';
}

export const rowLetter = (row: number) => String.fromCharCode(64 + row);

const CATEGORY_SEAT: Record<SeatCategory, string> = {
  STANDARD: 'border-ink-600 bg-ink-800',
  PREMIUM: 'border-sky-400/50 bg-sky-400/20',
  RECLINER: 'border-gold-400/60 bg-gold-400/25',
};
const CATEGORY_TEXT: Record<SeatCategory, string> = {
  STANDARD: 'text-ink-500',
  PREMIUM: 'text-sky-300',
  RECLINER: 'text-gold-300',
};
const STATE_SEAT: Record<SeatState, string> = {
  free: 'border-ink-600 bg-transparent',
  held: 'border-gold-400/70 bg-gold-400/40',
  sold: 'border-emerald-400/60 bg-emerald-400/60',
};

export const CATEGORY_NAME: Record<SeatCategory, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
};

export function HallMap({
  rows,
  cols,
  categoryOf,
  stateOf,
  size = 'md',
  label,
}: {
  rows: number;
  cols: number;
  categoryOf: (row: number) => SeatCategory;
  /** With states: a show's map. Without: a layout coloured by category. */
  stateOf?: (row: number, number: number) => SeatState;
  size?: 'sm' | 'md';
  label: string;
}) {
  const small = size === 'sm';
  const seat = small ? 'h-2 w-2 rounded-[2px]' : 'aspect-square w-full rounded-[3px]';
  return (
    <div role="img" aria-label={label} className="w-full">
      <div aria-hidden="true" className={`mx-auto ${small ? 'mb-2' : 'mb-4'} w-[85%]`}>
        <div className="h-0.5 rounded-full bg-gradient-to-r from-transparent via-ink-300 to-transparent" />
        {small ? null : (
          <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-[0.4em] text-ink-500">
            Screen
          </p>
        )}
      </div>
      <div
        aria-hidden="true"
        className={`mx-auto flex flex-col ${small ? 'gap-[3px]' : 'gap-1'}`}
        style={small ? undefined : { maxWidth: `${cols * 1.4 + 2.5}rem` }}
      >
        {Array.from({ length: rows }, (_, index) => {
          const row = index + 1;
          const category = categoryOf(row);
          return (
            <div
              key={row}
              className={`flex items-center ${small ? 'justify-center gap-[3px]' : 'gap-1.5'}`}
            >
              {small ? null : (
                <span
                  className={`w-3 shrink-0 text-center font-mono text-[9px] ${CATEGORY_TEXT[category]}`}
                >
                  {rowLetter(row)}
                </span>
              )}
              <div
                className={small ? 'flex gap-[3px]' : 'grid flex-1 gap-1'}
                style={
                  small ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
                }
              >
                {Array.from({ length: cols }, (_, col) => (
                  <span
                    key={col}
                    className={`block border ${seat} ${
                      stateOf ? STATE_SEAT[stateOf(row, col + 1)] : CATEGORY_SEAT[category]
                    }`}
                  />
                ))}
              </div>
              {small ? null : (
                <span
                  className={`w-3 shrink-0 text-center font-mono text-[9px] ${CATEGORY_TEXT[category]}`}
                >
                  {rowLetter(row)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The key under a layout: what each colour is, with how many seats. */
export function CategoryLegend({ counts }: { counts: Partial<Record<SeatCategory, number>> }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-400">
      {(['STANDARD', 'PREMIUM', 'RECLINER'] as const)
        .filter((category) => counts[category])
        .map((category) => (
          <li key={category} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-3 w-3 rounded-[3px] border ${CATEGORY_SEAT[category]}`}
            />
            {CATEGORY_NAME[category]}
            <span className="tabular-nums text-ink-500">{counts[category]}</span>
          </li>
        ))}
    </ul>
  );
}

/** The key under a show's map. */
export function StateLegend({ counts }: { counts: Record<SeatState, number> }) {
  const items: { state: SeatState; label: string }[] = [
    { state: 'sold', label: 'Sold' },
    { state: 'held', label: 'On hold' },
    { state: 'free', label: 'Available' },
  ];
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-400">
      {items.map((item) => (
        <li key={item.state} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-3 w-3 rounded-[3px] border ${STATE_SEAT[item.state]}`}
          />
          {item.label}
          <span className="tabular-nums text-ink-500">{counts[item.state]}</span>
        </li>
      ))}
    </ul>
  );
}
