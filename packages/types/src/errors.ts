import { z } from "zod";

/** Stable machine-readable codes. Clients branch on `code`, never on `message`. */
export const ErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
  // Auth gates (apps/api/src/plugins/auth.ts), in the order they're checked.
  "MFA_REQUIRED",
  "LEGAL_ACCEPTANCE_REQUIRED",
  "MFA_SETUP_REQUIRED",
  "CSRF_INVALID",
  "EMAIL_NOT_VERIFIED",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Body of every non-2xx API response. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
