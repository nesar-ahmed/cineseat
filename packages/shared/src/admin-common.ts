import { z } from 'zod';

/**
 * Pieces every admin module shares (movies, theaters, showtimes), so their
 * lists sort, filter and report history the same way.
 */

export const SortOrder = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrder>;

/** `scheduled`: has at least one show that has not started yet; `unscheduled`: has none. */
export const AdminScheduleFilter = z.enum(['scheduled', 'unscheduled']);
export type AdminScheduleFilter = z.infer<typeof AdminScheduleFilter>;

/** One change recorded in the audit log. */
export const AdminHistoryEntrySchema = z.object({
  id: z.string(),
  /**
   * What was done: `create`, `update`, `delete`, and per module e.g. `poster`,
   * `screen.create`, `screen.update`, `screen.delete`.
   */
  action: z.string(),
  /** For updates: the fields that changed. */
  fields: z.array(z.string()),
  /**
   * What the change was about, in words, as it read at the time ("Screen 2",
   * a movie's title) — still readable after the thing itself is deleted.
   */
  subject: z.string().nullable(),
  actor: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  at: z.string(),
});
export type AdminHistoryEntry = z.infer<typeof AdminHistoryEntrySchema>;

/** Latest changes an admin detail page shows. */
export const ADMIN_HISTORY_LIMIT = 12;

/** Items one bulk request may touch. */
export const MAX_BULK_ITEMS = 100;

/** Ids for a bulk action: at least one, at most `MAX_BULK_ITEMS`, duplicates dropped. */
export const BulkIdsSchema = z
  .array(z.string().trim().min(1).max(64))
  .min(1, 'Choose at least one item')
  .max(MAX_BULK_ITEMS, `At most ${MAX_BULK_ITEMS} at once`)
  .transform((ids) => [...new Set(ids)]);

/** What a bulk action did: each item succeeds or fails on its own, with the reason. */
export const BulkResultSchema = z.object({
  succeeded: z.array(z.string()),
  failed: z.array(
    z.object({
      id: z.string(),
      /** How the item reads ("Dhaka Noir · Gulshan, Screen 1 · Fri 13 Nov, 6:00 PM"), null if unknown. */
      label: z.string().nullable(),
      message: z.string(),
    }),
  ),
});
export type BulkResult = z.infer<typeof BulkResultSchema>;
