import { z } from 'zod';

/** One selectable filter value and how many results it would give. */
export const FacetOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().min(0),
});
export type FacetOption = z.infer<typeof FacetOptionSchema>;

/**
 * GET /catalog/facets — counts for every filter option, computed with all the
 * *other* active filters applied (choosing an option gives exactly `count`
 * results). Every known option is listed, including those at zero.
 */
export const CatalogFacetsSchema = z.object({
  total: z.number().int().min(0),
  status: z.array(FacetOptionSchema),
  genres: z.array(FacetOptionSchema),
  languages: z.array(FacetOptionSchema),
  certificates: z.array(FacetOptionSchema),
  formats: z.array(FacetOptionSchema),
  cities: z.array(FacetOptionSchema),
  theaters: z.array(FacetOptionSchema.extend({ city: z.string() })),
});
export type CatalogFacets = z.infer<typeof CatalogFacetsSchema>;

const LabelledSchema = z.object({ value: z.string(), label: z.string() });

/** GET /catalog/filters — the vocabulary for building filter UIs and booking widgets. */
export const CatalogFiltersSchema = z.object({
  /** IANA zone all show dates and times are expressed in. */
  timeZone: z.string(),
  /** Bookable days, today first (YYYY-MM-DD in `timeZone`). */
  dates: z.array(z.string()),
  status: z.array(LabelledSchema),
  genres: z.array(z.string()),
  languages: z.array(z.string()),
  certificates: z.array(LabelledSchema),
  formats: z.array(z.string()),
  cities: z.array(z.string()),
  theaters: z.array(z.object({ id: z.string(), name: z.string(), city: z.string() })),
  sorts: z.array(LabelledSchema),
});
export type CatalogFilters = z.infer<typeof CatalogFiltersSchema>;
