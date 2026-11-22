/**
 * Booking rules both apps must agree on. The hold length is deployment config
 * (`HOLD_MINUTES` on the API) and is returned with each seat map.
 */

/** Days of schedule the catalog offers, today included. */
export const SCHEDULE_DAYS = 7;

/** Seats one booking may hold — one checkout, one show. */
export const MAX_SEATS_PER_BOOKING = 6;

/** Currency of every amount in the API; amounts are integers in minor units (poisha). */
export const CURRENCY = 'BDT';

/**
 * Pricing policy: a show has one base price (the standard seat, 3D included);
 * better seats add a fixed surcharge, in minor units: +৳100 premium, +৳200
 * recliner. The API prices every seat with it; the admin panel previews with it.
 */
export const SEAT_SURCHARGE = { STANDARD: 0, PREMIUM: 10_000, RECLINER: 20_000 } as const;
