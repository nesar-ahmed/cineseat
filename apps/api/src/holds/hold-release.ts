import { fromSqlTime, placeholders, sqlTime, type InventoryTx } from '../database/inventory-lane';
import { liveSeatLabels } from '../notifications/booking-seats';
import { bookingFailed, holdExpired } from '../notifications/messages';
import { notify } from '../notifications/notify';

/*
 * Steps that end holds and free their seats. They run inside an InventoryLane
 * unit of work (synchronously, on the lane's transaction).
 */

const HOLD_LAPSED = 'The seat hold ended before the payment was completed.';
const HOLD_ABANDONED = 'Checkout was abandoned and the seats were released.';

type HoldRef = { id: string };

/**
 * Lapsed holds end: their seats go back on sale — as does any seat whose hold
 * time has passed, even without a booking. Reads already treat such seats as
 * free; this makes it so. A lapsed hold on which the buyer had started paying
 * is kept as FAILED, any other is removed; either way its owner is told.
 */
export function releaseExpiredHolds(tx: InventoryTx, now: Date, showId?: string): number {
  const scope = showId ? ` AND "showId" = ?` : '';
  const params = showId ? [sqlTime(now), showId] : [sqlTime(now)];
  const lapsed = tx.all<HoldRef>(
    `SELECT "id" FROM "bookings" WHERE "status" = 'PENDING' AND "expiresAt" <= ?${scope}`,
    ...params,
  );
  endHolds(tx, lapsed, now, HOLD_LAPSED, true);
  tx.run(
    `UPDATE "show_seats" SET "status" = 'AVAILABLE', "heldBy" = NULL, "holdExpiresAt" = NULL
     WHERE "status" = 'HELD' AND "holdExpiresAt" <= ?${scope}`,
    ...params,
  );
  return lapsed.length;
}

/**
 * Ends a buyer's holds (all of them, or the one given) and frees their seats:
 * releasing, or holding other seats instead. Only PENDING bookings are holds;
 * paid bookings are never touched. The buyer did this themselves, so nobody is
 * notified.
 */
export function releaseHolds(tx: InventoryTx, userId: string, now: Date, holdId?: string): number {
  const holds = holdId
    ? tx.all<HoldRef>(
        `SELECT "id" FROM "bookings" WHERE "userId" = ? AND "status" = 'PENDING' AND "id" = ?`,
        userId,
        holdId,
      )
    : tx.all<HoldRef>(
        `SELECT "id" FROM "bookings" WHERE "userId" = ? AND "status" = 'PENDING'`,
        userId,
      );
  return endHolds(tx, holds, now, HOLD_ABANDONED, false);
}

/**
 * Seats back on sale; then a hold nobody tried to pay for is deleted (its
 * booking seats cascade), while one with payment attempts — which must stay
 * on record — becomes FAILED: its seats are released (kept as history, no
 * longer live) and any payment still open is closed. Money that arrives for a
 * closed payment is refunded when the provider reports it.
 */
function endHolds(
  tx: InventoryTx,
  holds: HoldRef[],
  now: Date,
  reason: string,
  tellOwner: boolean,
): number {
  if (holds.length === 0) return 0;
  const ids = holds.map((hold) => hold.id);
  const at = sqlTime(now);
  const list = placeholders(ids.length);

  tx.run(
    `UPDATE "show_seats" SET "status" = 'AVAILABLE', "heldBy" = NULL, "holdExpiresAt" = NULL
     WHERE "status" = 'HELD' AND "id" IN (
       SELECT "showSeatId" FROM "booking_seats" WHERE "releasedAt" IS NULL AND "bookingId" IN (${list}))`,
    ...ids,
  );

  const attempted = tx.all<{ id: string; userId: string; title: string }>(
    `SELECT b."id", b."userId", m."title" FROM "bookings" b
     JOIN "shows" s ON s."id" = b."showId" JOIN "movies" m ON m."id" = s."movieId"
     WHERE b."id" IN (${list}) AND EXISTS (SELECT 1 FROM "payments" p WHERE p."bookingId" = b."id")`,
    ...ids,
  );
  const kept = new Set(attempted.map((booking) => booking.id));
  const unpaid = ids.filter((id) => !kept.has(id));
  if (unpaid.length > 0 && tellOwner) {
    // Read before the delete: the booking, and with it its seat list, goes away.
    const lapsed = tx.all<{
      id: string;
      userId: string;
      showId: string;
      title: string;
      expiresAt: string | null;
      startsAt: string;
    }>(
      `SELECT b."id", b."userId", b."showId", b."expiresAt", s."startsAt", m."title" FROM "bookings" b
       JOIN "shows" s ON s."id" = b."showId" JOIN "movies" m ON m."id" = s."movieId"
       WHERE b."id" IN (${placeholders(unpaid.length)})`,
      ...unpaid,
    );
    for (const hold of lapsed) {
      notify(tx, now, {
        ...holdExpired({
          showId: hold.showId,
          title: hold.title,
          labels: liveSeatLabels(tx, hold.id),
          // Holds never outlast the show's start; one that ended there ended with it.
          showStarted:
            hold.expiresAt !== null &&
            fromSqlTime(hold.expiresAt).getTime() >= fromSqlTime(hold.startsAt).getTime(),
        }),
        userId: hold.userId,
      });
    }
  }
  if (unpaid.length > 0) {
    tx.run(`DELETE FROM "bookings" WHERE "id" IN (${placeholders(unpaid.length)})`, ...unpaid);
  }
  if (attempted.length > 0) {
    const keptIds = [...kept];
    const keptList = placeholders(keptIds.length);
    tx.run(
      `UPDATE "payments" SET "status" = 'FAILED', "failureReason" = ?, "completedAt" = ?
       WHERE "status" = 'PENDING' AND "bookingId" IN (${keptList})`,
      reason,
      at,
      ...keptIds,
    );
    tx.run(
      `UPDATE "booking_seats" SET "releasedAt" = ? WHERE "releasedAt" IS NULL AND "bookingId" IN (${keptList})`,
      at,
      ...keptIds,
    );
    tx.run(
      `UPDATE "bookings" SET "status" = 'FAILED', "expiresAt" = NULL, "updatedAt" = ? WHERE "id" IN (${keptList})`,
      at,
      ...keptIds,
    );
    if (tellOwner) {
      for (const booking of attempted) {
        notify(tx, now, {
          ...bookingFailed({ bookingId: booking.id, title: booking.title }),
          userId: booking.userId,
        });
      }
    }
  }
  return ids.length;
}
