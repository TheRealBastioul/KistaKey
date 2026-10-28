import type { LegalKey } from "@repo/types";
import { tenantWhere, type UserTenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";

export interface NewLegalDocument {
  key: LegalKey;
  version: number;
  title: string;
  body: string;
  bodySha256: string;
  requiresReacceptance: boolean;
  publishedAt: Date;
}

// legal_documents is global (not tenant-owned); acceptances are per user.
export function createLegalRepository({ writer, reader }: DbHandles) {
  return {
    findVersion(key: LegalKey, version: number) {
      return writer.legalDocument.findUnique({ where: { key_version: { key, version } } });
    },

    create(doc: NewLegalDocument) {
      return writer.legalDocument.create({ data: doc });
    },

    /** Small table (a few rows per year), loaded whole into the catalog cache. */
    listAll() {
      return reader.legalDocument.findMany({ orderBy: [{ key: "asc" }, { version: "asc" }] });
    },

    /** Versions this user accepted. Writer: must see an acceptance made a moment ago. */
    acceptedVersions(tenant: UserTenant) {
      return writer.legalAcceptance.findMany({
        where: tenantWhere(tenant),
        select: { document: { select: { key: true, version: true } } },
      });
    },

    createAcceptances(
      rows: {
        userId: string;
        documentId: string;
        ipAddress: string | null;
        via: "signup" | "gate";
      }[],
    ) {
      return writer.legalAcceptance.createMany({ data: rows, skipDuplicates: true });
    },
  };
}

export type LegalRepository = ReturnType<typeof createLegalRepository>;
