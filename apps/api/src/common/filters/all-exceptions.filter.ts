import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * One error shape for every failed request (guideline section 6, 13):
 * `{ statusCode, message, error, path, timestamp }` — matching `ApiError`
 * in @cineseat/shared. Internal details and stacks never leave the server.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = reasonPhrase(status);
      } else {
        const parsed = body as { message?: string | string[]; error?: string };
        message = parsed.message ?? exception.message;
        error = parsed.error ?? reasonPhrase(status);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique-constraint violations surface as a conflict, not a 500.
      status = exception.code === 'P2002' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      message = status === HttpStatus.CONFLICT ? 'Already exists' : 'Request could not be stored';
      error = reasonPhrase(status);
      this.logger.warn(`Prisma ${exception.code} on ${request.method} ${request.url}`);
    } else if (exception instanceof Error) {
      this.logger.error(`${request.method} ${request.url} → ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unhandled non-error exception on ${request.method} ${request.url}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

/** HttpStatus is a reverse-mapped enum, so a status number maps back to its reason phrase. */
function reasonPhrase(status: number): string {
  const phrase: unknown = HttpStatus[status as unknown as keyof typeof HttpStatus];
  return typeof phrase === 'string' ? phrase : 'Error';
}
