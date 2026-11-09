import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger';
import { ApiErrorSchema } from '@cineseat/shared';

/**
 * Zod is the single source of truth: the schema that validates a request also
 * documents it in Swagger, so the docs cannot drift from the implementation.
 * (`$schema` is dropped — it names the JSON-Schema dialect, not the OpenAPI one.)
 */
export function toOpenApiSchema(schema: z.ZodType<unknown, unknown>): SchemaObject {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema as SchemaObject;
}

/** Every non-2xx answer has this shape, produced by `AllExceptionsFilter`. */
export const ERROR_SCHEMA = toOpenApiSchema(ApiErrorSchema);
