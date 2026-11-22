import { z } from 'zod';
import { SeatCategory } from './enums';
import { MAX_SEATS_PER_BOOKING } from './rules';

/**
 * POST /holds — reserve seats of one show for a few minutes while the buyer
 * checks out. `seatIds` are show-seat ids from GET /shows/:id/seats. All seats
 * are held or none is; a new hold replaces the buyer's previous one.
 */
export const CreateHoldSchema = z.object({
  showId: z.string().trim().min(1).max(64),
  seatIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, 'Pick at least one seat')
    .max(MAX_SEATS_PER_BOOKING, `Up to ${MAX_SEATS_PER_BOOKING} seats per booking`)
    .refine((ids) => new Set(ids).size === ids.length, 'Each seat can be picked only once'),
});
export type CreateHoldInput = z.infer<typeof CreateHoldSchema>;

export const HoldSeatSchema = z.object({
  id: z.string(), // show-seat id
  label: z.string(),
  category: SeatCategory,
  /** Minor units. */
  price: z.number().int().min(0),
});
export type HoldSeat = z.infer<typeof HoldSeatSchema>;

/**
 * Seats reserved for one buyer until `expiresAt` (ISO, UTC). Everyone else sees
 * them as HELD on the seat map; when the hold ends unpaid, it is removed and the
 * seats are back on sale.
 */
export const HoldSchema = z.object({
  id: z.string(),
  showId: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  currency: z.string(),
  /** Minor units: the sum of the seat prices. */
  totalAmount: z.number().int().min(0),
  seats: z.array(HoldSeatSchema),
});
export type Hold = z.infer<typeof HoldSchema>;
