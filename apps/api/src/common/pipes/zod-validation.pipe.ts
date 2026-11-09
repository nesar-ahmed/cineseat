import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request payload against a shared Zod schema and hands the
 * *parsed* value to the handler — so trimming, lowercasing and coercion in
 * the schema actually take effect (guideline section 9 and 13).
 *
 * Usage: `@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput`
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues.map(
        (issue) => `${issue.path.length ? issue.path.join('.') : 'body'}: ${issue.message}`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'Validation Failed',
        message: message.length ? message : 'Invalid request payload',
      });
    }
    return result.data;
  }
}
