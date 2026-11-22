import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header the mock gateway signs its webhooks with: `t=<unix seconds>,v1=<hex HMAC-SHA256>`. */
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/** Events older than this are refused, so a captured request cannot be replayed later. */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Signs `body` the way real providers do (Stripe-style): the HMAC covers the
 * timestamp and the exact bytes sent, so neither can be changed in transit.
 */
export function signMockEvent(secret: string, body: string, now: Date = new Date()): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  return `t=${timestamp},v1=${hmac(secret, `${timestamp}.${body}`)}`;
}

/** True only for a signature made with `secret` over exactly `body`, recently. */
export function verifyMockSignature(
  secret: string,
  header: string | undefined,
  body: Buffer | string,
  now: Date = new Date(),
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(',').map((part) => {
      const at = part.indexOf('=');
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isInteger(timestamp) || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = hmac(secret, `${timestamp}.${body.toString()}`);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
