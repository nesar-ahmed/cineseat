/**
 * Rules for the sample hall on the home page — the same ones the real seat map
 * follows: a five-minute hold (HOLD_MINUTES) that starts when seats are
 * reserved, six seats at most, and the seed's row tiers (last row recliner, the
 * one before it premium). Prices are a sample: standard at a typical evening
 * price, premium +৳100 and recliner +৳200 as the API charges.
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
