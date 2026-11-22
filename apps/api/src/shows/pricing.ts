import {
  SEAT_SURCHARGE,
  type SeatCategory,
  type SeatPrices,
  type ShowAvailability,
} from '@cineseat/shared';

/**
 * Pricing policy: a show has one base price (the standard seat, 3D included);
 * better seats add a fixed surcharge (`SEAT_SURCHARGE` in @cineseat/shared, so
 * the admin panel previews prices with the same numbers). Checkout recomputes
 * every price with these same functions.
 */
export const CATEGORY_SURCHARGE: Record<SeatCategory, number> = SEAT_SURCHARGE;

/** Minutes a screen needs between two shows (exit, clean, seat the next audience). */
export const TURNAROUND_MINUTES = 20;

export function seatPrice(basePrice: number, category: SeatCategory): number {
  return basePrice + CATEGORY_SURCHARGE[category];
}

/** Prices for the categories a screen actually has. */
export function pricesFor(basePrice: number, categories: Iterable<SeatCategory>): SeatPrices {
  const prices: SeatPrices = {};
  for (const category of categories) prices[category] = seatPrice(basePrice, category);
  return prices;
}

/** Share of seats taken (sold or held) from which a show reads "almost full" / "filling". */
export const ALMOST_FULL_SHARE = 0.85;
export const FILLING_SHARE = 0.6;

/** Share of seats taken → the label people see (same thresholds as the web app). */
export function availabilityOf(total: number, available: number): ShowAvailability {
  if (total === 0 || available === 0) return 'SOLD_OUT';
  const taken = 1 - available / total;
  if (taken >= ALMOST_FULL_SHARE) return 'ALMOST_FULL';
  if (taken >= FILLING_SHARE) return 'FILLING';
  return 'AVAILABLE';
}

/** `availabilityOf` as a SQL expression over two numeric SQL expressions. */
export function availabilitySql(total: string, available: string): string {
  const taken = `(1.0 - (${available}) * 1.0 / (${total}))`;
  return `(CASE
    WHEN (${total}) = 0 OR (${available}) <= 0 THEN 'SOLD_OUT'
    WHEN ${taken} >= ${ALMOST_FULL_SHARE} THEN 'ALMOST_FULL'
    WHEN ${taken} >= ${FILLING_SHARE} THEN 'FILLING'
    ELSE 'AVAILABLE' END)`;
}
