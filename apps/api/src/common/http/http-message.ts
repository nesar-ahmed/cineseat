import type { HttpException } from '@nestjs/common';

/**
 * The message a client would see for `error` — for bulk and batch answers,
 * which report each item's failure in words. An array of messages reads as one
 * sentence (`HttpException.message` would say only "Conflict Exception").
 */
export function httpMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message.join(' ');
  return message ?? error.message;
}
