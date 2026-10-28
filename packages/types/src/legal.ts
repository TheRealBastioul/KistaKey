import { z } from "zod";
import { IsoDateSchema } from "./common";

export const LegalKeySchema = z.enum(["terms", "privacy"]);
export type LegalKey = z.infer<typeof LegalKeySchema>;

/** A published, immutable version of Terms or Privacy. `body` is Markdown (render without raw HTML). */
export const LegalDocumentSchema = z.object({
  key: LegalKeySchema,
  version: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  requiresReacceptance: z.boolean(),
  publishedAt: IsoDateSchema,
});
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

/** GET /legal/current */
export const LegalCurrentResponseSchema = z.object({
  documents: z.array(LegalDocumentSchema),
});
export type LegalCurrentResponse = z.infer<typeof LegalCurrentResponseSchema>;

/** A document the user must accept before using the app. */
export const PendingLegalSchema = z.object({
  key: LegalKeySchema,
  version: z.number().int().positive(),
  title: z.string(),
  /** True if the user never accepted any version of it. */
  firstTime: z.boolean(),
});
export type PendingLegal = z.infer<typeof PendingLegalSchema>;

export const LegalAcceptanceSchema = z.object({
  key: LegalKeySchema,
  version: z.number().int().positive(),
});
export type LegalAcceptance = z.infer<typeof LegalAcceptanceSchema>;

/** POST /me/legal/accept: must cover every pending document at its current version. */
export const LegalAcceptRequestSchema = z.object({
  accepted: z.array(LegalAcceptanceSchema).min(1).max(10),
});
export type LegalAcceptRequest = z.infer<typeof LegalAcceptRequestSchema>;
