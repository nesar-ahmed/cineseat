import type { SeatCategory } from '@cineseat/shared';

/**
 * Seat geometry, shared by the screens API and the seed: rows are lettered from
 * the screen (A = front), the back `reclinerRows` are RECLINER and the
 * `premiumRows` in front of them PREMIUM.
 */
export type Layout = { rows: number; cols: number; premiumRows: number; reclinerRows: number };

export function rowLetter(row: number): string {
  return String.fromCharCode(64 + row);
}

export function seatLabel(row: number, number: number): string {
  return `${rowLetter(row)}${number}`;
}

export function categoryFor(
  row: number,
  layout: Pick<Layout, 'rows' | 'premiumRows' | 'reclinerRows'>,
): SeatCategory {
  if (row > layout.rows - layout.reclinerRows) return 'RECLINER';
  if (row > layout.rows - layout.reclinerRows - layout.premiumRows) return 'PREMIUM';
  return 'STANDARD';
}

/** Every seat of a layout, front row first. */
export function seatsFor(
  layout: Layout,
): { row: number; number: number; category: SeatCategory }[] {
  const seats: { row: number; number: number; category: SeatCategory }[] = [];
  for (let row = 1; row <= layout.rows; row++) {
    for (let number = 1; number <= layout.cols; number++)
      seats.push({ row, number, category: categoryFor(row, layout) });
  }
  return seats;
}
