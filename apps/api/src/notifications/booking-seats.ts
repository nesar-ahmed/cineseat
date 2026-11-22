import type { InventoryTx } from '../database/inventory-lane';
import { seatLabel } from '../theaters/seat-layout';

/**
 * The seats a booking holds now, in row order: ["A1", "A2"] — for the text of
 * notifications written inside an InventoryLane unit.
 */
export function liveSeatLabels(tx: InventoryTx, bookingId: string): string[] {
  return tx
    .all<{ row: number; number: number }>(
      `SELECT s."row", s."number" FROM "booking_seats" bs
       JOIN "show_seats" ss ON ss."id" = bs."showSeatId" JOIN "seats" s ON s."id" = ss."seatId"
       WHERE bs."bookingId" = ? AND bs."releasedAt" IS NULL ORDER BY s."row", s."number"`,
      bookingId,
    )
    .map((seat) => seatLabel(seat.row, seat.number));
}
