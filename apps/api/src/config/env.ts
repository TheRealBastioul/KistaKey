// Validated process config. Imported only by the entry points (server.ts,
// worker.ts) and db/client.ts; everything else receives config as
// arguments, so tests never need a real environment.
import "dotenv/config";
import { z } from "zod";

/** A base64 secret of at least `bytes` bytes, decoded. */
const secretKey = (bytes: number, exact = false) =>
  z.string().transform((value, ctx) => {
    const key = Buffer.from(value, "base64");
    if (exact ? key.length !== bytes : key.length < bytes) {
      ctx.addIssue({
        code: "custom",
        message: `must be ${exact ? "exactly" : "at least"} ${bytes} bytes, base64-encoded`,
      });
      return z.NEVER;
    }
    return key;
  });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url(),
  DATABASE_REPLICA_URL: z.url().optional(),
  REDIS_URL: z.url(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  /** Where the web app is served: WebAuthn origin + RP ID, email links, Secure cookies (https). */
  APP_ORIGIN: z.url().default("http://localhost:5173"),
  /** AES-256-GCM key for server-readable secrets (TOTP seeds) until KMS (Phase 24). */
  SERVER_ENCRYPTION_KEY: secretKey(32, true),
  /** HMAC key: fake prelogin salts and hashing of short codes. */
  SERVER_HMAC_KEY: secretKey(32),
  MAIL_HOST: z.string().default("127.0.0.1"),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_SECURE: z.stringbool().default(false),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("no-reply@localhost"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Fail fast at startup with every problem listed, instead of a
    // confusing error the first time a missing value is used.
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
