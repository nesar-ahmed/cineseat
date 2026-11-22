import { z } from 'zod';

/**
 * What the mock gateway reports to the API, signed (see mock-signature.ts). One
 * event per payment decision; the API applies each at most once.
 */
export const MockEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  /** Unix seconds. */
  created: z.number().int(),
  data: z.object({
    /** The payment's `providerRef`. */
    ref: z.string().min(1),
    amount: z.number().int().min(0),
    currency: z.string(),
    /** "Visa •••• 4242", "bKash 017•••••678" — never a full card number. */
    method: z.string().nullable(),
    /** Why a payment failed. */
    reason: z.string().nullable(),
  }),
});
export type MockEvent = z.infer<typeof MockEventSchema>;
