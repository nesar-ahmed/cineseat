import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  HOLD_MINUTES: z.coerce.number().int().positive().default(5),
  REFUND_CUTOFF_HOURS: z.coerce.number().int().positive().default(2),
  TICKET_SECRET: z.string().min(16).default('dev-only-insecure-ticket-secret'),
  UPLOAD_DIR: z.string().default('./uploads'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Typed env loading (guideline section 5.1: config/ folder).
 * Loaded by ConfigModule; read it through ConfigService with these keys.
 */
export function validateEnv(): Record<string, unknown> {
  const parsed = EnvSchema.parse(process.env);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    webOrigin: parsed.WEB_ORIGIN,
    holdMinutes: parsed.HOLD_MINUTES,
    refundCutoffHours: parsed.REFUND_CUTOFF_HOURS,
    ticketSecret: parsed.TICKET_SECRET,
    uploadDir: parsed.UPLOAD_DIR,
  };
}
