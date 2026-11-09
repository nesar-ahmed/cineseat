/**
 * Landing demo rules — they mirror the API defaults so nothing on the page
 * promises what the backend does not enforce:
 * `HOLD_MINUTES=5` and a six-seat maximum (guideline 2.4), and the same row
 * tiering the seed script uses (last row recliner, previous rows premium).
 * Price tiers are placeholders until per-category pricing lands in phase 3.
 */
export const HOLD_SECONDS = 5 * 60;
export const MAX_SEATS = 6;

export const SEAT_PRICES = { STANDARD: 400, PREMIUM: 500, RECLINER: 600 } as const;
export type SeatTier = keyof typeof SEAT_PRICES;

const PREMIUM_ROWS = 2;

export function seatCategory(row: number, rows: number): SeatTier {
  if (row === rows) return 'RECLINER';
  if (row > rows - PREMIUM_ROWS) return 'PREMIUM';
  return 'STANDARD';
}
