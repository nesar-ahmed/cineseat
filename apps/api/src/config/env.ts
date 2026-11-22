import { existsSync } from 'node:fs';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** SQLite file, relative to the API folder (apps/api). */
  DATABASE_PATH: z.string().min(1).default('./data/dev.db'),
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  HOLD_MINUTES: z.coerce.number().int().positive().default(5),
  REFUND_CUTOFF_HOURS: z.coerce.number().int().positive().default(2),
  TICKET_SECRET: z.string().min(16).default('dev-only-insecure-ticket-secret'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /**
   * Payments are simulated. `mock` is the only provider there is: a test gateway
   * that accepts test cards only and never moves money. Anything else is refused.
   */
  PAYMENT_PROVIDER: z
    .literal('mock', { error: 'Only the mock payment provider exists' })
    .default('mock'),
  /** Signs the mock gateway's webhooks; the API rejects any event without a valid signature. */
  MOCK_PAYMENT_SECRET: z.string().min(16).default('dev-only-insecure-mock-payment-secret'),
  /** Where the mock gateway delivers its webhooks; defaults to this API on PORT. */
  MOCK_WEBHOOK_URL: z.string().url().optional(),
  /** How long the mock gateway takes to confirm a payment, like a real provider's webhook. */
  MOCK_WEBHOOK_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1500),
  /** Extra minutes a hold gets once the buyer starts paying (at most once per hold). */
  PAYMENT_WINDOW_MINUTES: z.coerce.number().int().positive().default(5),
  /** Who invoices are issued by: the same on every invoice, so it is configuration. */
  INVOICE_SELLER_NAME: z.string().min(1).default('CineSeat Entertainment Ltd.'),
  /** Street address; `|` separates lines. */
  INVOICE_SELLER_ADDRESS: z.string().min(1).default('Level 4, 12 Gulshan Avenue'),
  INVOICE_SELLER_CITY: z.string().min(1).default('Dhaka 1212'),
  INVOICE_SELLER_COUNTRY: z.string().min(1).default('Bangladesh'),
  INVOICE_SELLER_EMAIL: z.string().min(1).default('billing@cineseat.dev'),
  INVOICE_SELLER_WEBSITE: z.string().min(1).default('cineseat.dev'),
  /** IANA zone the cinemas run on: show dates, "today" and release days use it. */
  TIME_ZONE: z
    .string()
    .default('Asia/Dhaka')
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown IANA time zone'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Typed env loading (guideline section 5.1: config/ folder).
 * Loaded by ConfigModule; read it through ConfigService with these keys.
 */
export function validateEnv(): Record<string, unknown> {
  const parsed = EnvSchema.parse(process.env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    webOrigin: parsed.WEB_ORIGIN,
    holdMinutes: parsed.HOLD_MINUTES,
    refundCutoffHours: parsed.REFUND_CUTOFF_HOURS,
    ticketSecret: parsed.TICKET_SECRET,
    uploadDir: parsed.UPLOAD_DIR,
    paymentProvider: parsed.PAYMENT_PROVIDER,
    mockPaymentSecret: parsed.MOCK_PAYMENT_SECRET,
    mockWebhookUrl:
      parsed.MOCK_WEBHOOK_URL ?? `http://127.0.0.1:${parsed.PORT}/payments/webhook/mock`,
    mockWebhookDelayMs: parsed.MOCK_WEBHOOK_DELAY_MS,
    paymentWindowMinutes: parsed.PAYMENT_WINDOW_MINUTES,
    timeZone: parsed.TIME_ZONE,
    invoiceSeller: {
      name: parsed.INVOICE_SELLER_NAME,
      addressLines: parsed.INVOICE_SELLER_ADDRESS.split('|')
        .map((line) => line.trim())
        .filter(Boolean),
      city: parsed.INVOICE_SELLER_CITY,
      country: parsed.INVOICE_SELLER_COUNTRY,
      email: parsed.INVOICE_SELLER_EMAIL,
      website: parsed.INVOICE_SELLER_WEBSITE,
    },
  };
}

/**
 * Database location for entry points that run outside Nest (the TypeORM CLI and
 * the seed script): the same `.env` file and the same defaults as ConfigModule,
 * with real environment variables taking precedence over the file.
 */
export function databasePathFromEnv(): string {
  return standaloneEnv().DATABASE_PATH;
}

/** The cinemas' time zone, for the same standalone entry points. */
export function timeZoneFromEnv(): string {
  return standaloneEnv().TIME_ZONE;
}

function standaloneEnv(): Env {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return EnvSchema.parse(process.env);
}
