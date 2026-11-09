import { z } from 'zod';

/** Generic paginated list envelope returned by every list endpoint. */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** One error shape for every failed request. */
export const ApiErrorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string().or(z.array(z.string())),
  error: z.string(),
  path: z.string().optional(),
  timestamp: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Common query params for lists. */
export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;
