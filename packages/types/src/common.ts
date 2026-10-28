import { z } from "zod";

/** Lowercased, trimmed email. Accounts are unique on this form. */
export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** base64url without padding (the only base64 flavour on the wire). */
export const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, "expected base64url");

/** A 32-byte key or key-derived value, base64url (43 chars). */
export const Key32Schema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "expected a 32-byte key");

/** A 16-byte salt, base64url (22 chars). */
export const Salt16Schema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "expected a 16-byte salt");

/**
 * Client-encrypted blob from @repo/crypto: v<version>.<alg>.<parts...>.
 * The server stores it as-is and never parses the contents.
 */
export const EncryptedBlobSchema = z
  .string()
  .max(16_384)
  .regex(/^v\d+\.[a-z0-9]+(\.[A-Za-z0-9_-]+)+$/, "expected an encrypted blob");

/** Opaque random token from an email link or an earlier step. */
export const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, "expected a token");

export const IsoDateSchema = z.iso.datetime();

/** `/:id` route params. */
export const IdParamsSchema = z.object({ id: z.uuid() });

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;
