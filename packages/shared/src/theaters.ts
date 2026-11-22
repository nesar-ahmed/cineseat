import { z } from 'zod';
import { SeatCategory, ShowFormat } from './enums';

/** Seats per category; `total` is their sum. */
export const SeatCountsSchema = z.object({
  total: z.number().int().min(0),
  STANDARD: z.number().int().min(0),
  PREMIUM: z.number().int().min(0),
  RECLINER: z.number().int().min(0),
});
export type SeatCounts = z.infer<typeof SeatCountsSchema>;

export const ScreenSchema = z.object({
  id: z.string(),
  theaterId: z.string(),
  name: z.string(),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  /** Formats the projector supports — a 3D show needs a 3D screen. */
  formats: z.array(ShowFormat),
  seatCounts: SeatCountsSchema,
});
export type Screen = z.infer<typeof ScreenSchema>;

/** One physical seat. Rows are lettered from the screen (A is the front row). */
export const SeatSchema = z.object({
  id: z.string(),
  row: z.number().int().positive(),
  number: z.number().int().positive(),
  label: z.string(), // "C7"
  category: SeatCategory,
});
export type Seat = z.infer<typeof SeatSchema>;

/** GET /screens/:id — the screen with its full seat layout. */
export const ScreenLayoutSchema = ScreenSchema.extend({ layout: z.array(SeatSchema) });
export type ScreenLayout = z.infer<typeof ScreenLayoutSchema>;

/** GET /theaters — one cinema with the numbers the cinema cards show. */
export const TheaterSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  amenities: z.array(z.string()),
  screenCount: z.number().int().min(0),
  seatCount: z.number().int().min(0),
  /** Today in the cinemas' time zone. */
  today: z.object({ shows: z.number().int().min(0), movies: z.number().int().min(0) }),
});
export type Theater = z.infer<typeof TheaterSchema>;

/** GET /theaters/:id */
export const TheaterDetailSchema = TheaterSchema.extend({ screens: z.array(ScreenSchema) });
export type TheaterDetail = z.infer<typeof TheaterDetailSchema>;

export const TheaterListQuerySchema = z.object({
  city: z.string().trim().min(1).max(60).optional(),
});
export type TheaterListQuery = z.infer<typeof TheaterListQuerySchema>;

const amenities = z
  .array(z.string().trim().min(2).max(40))
  .max(12)
  .transform((items) => Array.from(new Set(items)));

const TheaterFields = {
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(2).max(200),
  amenities,
};

/** POST /theaters (ADMIN) */
export const CreateTheaterSchema = z.object({
  ...TheaterFields,
  amenities: amenities.optional().default([]),
});
export type CreateTheaterInput = z.infer<typeof CreateTheaterSchema>;

/** PATCH /theaters/:id (ADMIN) */
export const UpdateTheaterSchema = z
  .object(TheaterFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateTheaterInput = z.infer<typeof UpdateTheaterSchema>;

/**
 * Seat layout: a rows × cols grid. The back `reclinerRows` rows are RECLINER,
 * the `premiumRows` in front of them PREMIUM, the rest STANDARD.
 */
const LayoutFields = {
  rows: z.number().int().min(1).max(26), // lettered A–Z
  cols: z.number().int().min(1).max(40),
  premiumRows: z.number().int().min(0).max(26),
  reclinerRows: z.number().int().min(0).max(26),
};
const layoutFits = (value: { rows?: number; premiumRows?: number; reclinerRows?: number }) =>
  value.rows === undefined || (value.premiumRows ?? 0) + (value.reclinerRows ?? 0) <= value.rows;
const LAYOUT_MESSAGE = {
  message: 'premiumRows + reclinerRows cannot exceed rows',
  path: ['premiumRows'],
};

const formats = z
  .array(ShowFormat)
  .min(1)
  .transform((items) => Array.from(new Set(items)));

/** POST /theaters/:id/screens (ADMIN) — the seats are generated from the layout. */
export const CreateScreenSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    ...LayoutFields,
    premiumRows: LayoutFields.premiumRows.optional().default(0),
    reclinerRows: LayoutFields.reclinerRows.optional().default(0),
    formats: formats.optional().default(['2D']),
  })
  .refine(layoutFits, LAYOUT_MESSAGE);
export type CreateScreenInput = z.infer<typeof CreateScreenSchema>;

/**
 * PATCH /screens/:id (ADMIN). A new layout must be sent whole (rows, cols,
 * premiumRows, reclinerRows) and is refused once the screen has shows.
 */
export const UpdateScreenSchema = z
  .object({ name: z.string().trim().min(1).max(40), formats, ...LayoutFields })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine(
    (value) => {
      const sent = (['rows', 'cols', 'premiumRows', 'reclinerRows'] as const).filter(
        (key) => value[key] !== undefined,
      );
      return sent.length === 0 || sent.length === 4;
    },
    {
      message: 'A new layout needs rows, cols, premiumRows and reclinerRows together',
      path: ['rows'],
    },
  )
  .refine(layoutFits, LAYOUT_MESSAGE);
export type UpdateScreenInput = z.infer<typeof UpdateScreenSchema>;
