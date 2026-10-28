// Published Terms / Privacy versions, seeded into legal_documents on API
// start (modules/legal). Kept as TypeScript (not .md files) so they're
// bundled into dist/ with the API.
//
// Rules:
// - A published version is immutable. The API refuses to start if a
//   version's text no longer matches what was seeded. To change a document,
//   append a new version.
// - requiresReacceptance: true = everyone is asked to accept again;
//   false = minor fix, existing acceptances still count.
// - Body is Markdown; the web app renders it without raw HTML.
import type { LegalKey } from "@repo/types";
import { PRIVACY_VERSIONS } from "./privacy";
import { TERMS_VERSIONS } from "./terms";

export interface LegalSource {
  key: LegalKey;
  version: number;
  title: string;
  requiresReacceptance: boolean;
  /** ISO date. A version is current once this has passed. */
  publishedAt: string;
  body: string;
}

export const LEGAL_DOCUMENTS: LegalSource[] = [...TERMS_VERSIONS, ...PRIVACY_VERSIONS];
