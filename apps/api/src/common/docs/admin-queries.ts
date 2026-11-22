import { ApiQuery } from '@nestjs/swagger';

/**
 * Swagger helpers for the admin lists' query strings, so every list documents
 * its filters the same way.
 */

/** A list filter: `?genre=Drama,Comedy` or `?genre=Drama&genre=Comedy`, options OR-ed. */
export function listQuery(
  name: string,
  description: string,
  values?: readonly string[],
): MethodDecorator {
  return ApiQuery({
    name,
    required: false,
    description: `${description} Comma-separated or repeated.`,
    schema: {
      type: 'array',
      items: values ? { type: 'string', enum: [...values] } : { type: 'string' },
    },
    style: 'form',
    explode: false,
  });
}

/** Applies several decorators as one (a list's query parameters). */
export function ApiQueries(...decorators: MethodDecorator[]): MethodDecorator {
  return (target, key, descriptor) => {
    for (const decorate of decorators) decorate(target, key, descriptor);
  };
}
