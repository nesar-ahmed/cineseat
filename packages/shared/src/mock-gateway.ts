import { z } from 'zod';

/**
 * CineSeat's test payment gateway. It stands in for a real provider (a hosted
 * payment page plus a signed webhook), but it never moves money and it refuses
 * real card numbers: only the cards and wallet codes below are accepted, and
 * each one decides the outcome.
 */
export const MOCK_TEST_CARDS = [
  { number: '4242424242424242', brand: 'Visa', outcome: 'SUCCEEDED', label: 'Payment succeeds' },
  {
    number: '5555555555554444',
    brand: 'Mastercard',
    outcome: 'SUCCEEDED',
    label: 'Payment succeeds',
  },
  {
    number: '4000000000000002',
    brand: 'Visa',
    outcome: 'FAILED',
    label: 'Card declined',
    message: 'Your card was declined.',
  },
  {
    number: '4000000000009995',
    brand: 'Visa',
    outcome: 'FAILED',
    label: 'Insufficient funds',
    message: 'Your card has insufficient funds.',
  },
] as const;
export type MockTestCard = (typeof MOCK_TEST_CARDS)[number];

/** Wallet payments (bKash, Nagad): any valid mobile number; the one-time code decides. */
export const MOCK_WALLET_CODES = { approve: '123456', decline: '000000' } as const;

export const MockSessionStatus = z.enum(['OPEN', 'COMPLETED', 'EXPIRED']);
export type MockSessionStatus = z.infer<typeof MockSessionStatus>;

/** GET /mock-gateway/sessions/:ref — what the gateway's payment page shows. */
export const MockGatewaySessionSchema = z.object({
  ref: z.string(),
  testMode: z.literal(true),
  merchant: z.string(),
  description: z.string(),
  amount: z.number().int().min(0),
  currency: z.string(),
  status: MockSessionStatus,
  expiresAt: z.string(),
  /** Where the page sends the buyer once the payment is decided. */
  returnUrl: z.string(),
});
export type MockGatewaySession = z.infer<typeof MockGatewaySessionSchema>;

const digits = (min: number, max: number, message: string) =>
  z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(new RegExp(`^\\d{${min},${max}}$`), message));

const Wallet = {
  wallet: z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/, 'Enter an 11-digit mobile number, e.g. 01712345678'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
};

/** POST /mock-gateway/sessions/:ref/pay — the payment page's form. */
export const MockPayInputSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('CARD'),
    cardNumber: digits(12, 19, 'Enter a card number'),
    expiry: z
      .string()
      .trim()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
    cvc: z
      .string()
      .trim()
      .regex(/^\d{3,4}$/, 'Enter the 3 or 4 digits on the back'),
    name: z.string().trim().min(2, 'Enter the name on the card').max(60),
  }),
  z.object({ method: z.literal('BKASH'), ...Wallet }),
  z.object({ method: z.literal('NAGAD'), ...Wallet }),
]);
export type MockPayInput = z.infer<typeof MockPayInputSchema>;

/** The gateway's answer to the payment page; the merchant hears the same through its webhook. */
export const MockPayResultSchema = z.object({
  status: z.enum(['SUCCEEDED', 'FAILED']),
  message: z.string(),
  returnUrl: z.string(),
});
export type MockPayResult = z.infer<typeof MockPayResultSchema>;
