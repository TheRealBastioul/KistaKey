// Versioned Terms / Privacy (OrkaVault's legalAcceptance pattern). For each
// key: the *current* version is the newest published one; the *required*
// version is the newest one marked requiresReacceptance. A user has a
// pending acceptance if they never accepted the key, or only accepted
// versions older than the required one.
import { createHash } from "node:crypto";
import type { LegalAcceptance, LegalDocument, LegalKey, PendingLegal } from "@repo/types";
import type { LegalSource } from "../../config/legal";
import { isUniqueViolation } from "../../db/errors";
import { userTenant } from "../../db/tenant";
import { badRequest } from "../../lib/errors";
import type { RequestMeta } from "../../lib/http";
import type { AuditService } from "../audit";
import type { LegalRepository } from "./legal.repository";

interface CatalogEntry {
  current: { id: string; version: number; title: string; doc: LegalDocument };
  requiredVersion: number;
}

/** Docs only change with a deploy, so a short in-process cache is enough. */
const CATALOG_TTL_MS = 60_000;

export function createLegalService(repo: LegalRepository, audit: AuditService) {
  let catalog: { at: number; entries: Map<LegalKey, CatalogEntry> } | undefined;

  async function loadCatalog(): Promise<Map<LegalKey, CatalogEntry>> {
    if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.entries;
    const now = new Date();
    const entries = new Map<LegalKey, CatalogEntry>();
    // Ordered by key, version ascending: later rows win.
    for (const row of await repo.listAll()) {
      if (row.publishedAt > now) continue;
      const previous = entries.get(row.key);
      entries.set(row.key, {
        current: {
          id: row.id,
          version: row.version,
          title: row.title,
          doc: {
            key: row.key,
            version: row.version,
            title: row.title,
            body: row.body,
            requiresReacceptance: row.requiresReacceptance,
            publishedAt: row.publishedAt.toISOString(),
          },
        },
        requiredVersion: row.requiresReacceptance
          ? row.version
          : (previous?.requiredVersion ?? row.version),
      });
    }
    catalog = { at: Date.now(), entries };
    return entries;
  }

  async function pending(userId: string): Promise<PendingLegal[]> {
    const entries = await loadCatalog();
    const accepted = await repo.acceptedVersions(userTenant(userId));
    const newest = new Map<LegalKey, number>();
    for (const { document } of accepted) {
      newest.set(document.key, Math.max(newest.get(document.key) ?? 0, document.version));
    }
    const result: PendingLegal[] = [];
    for (const [key, entry] of entries) {
      const has = newest.get(key);
      if (has === undefined || has < entry.requiredVersion) {
        result.push({
          key,
          version: entry.current.version,
          title: entry.current.title,
          firstTime: has === undefined,
        });
      }
    }
    return result;
  }

  /** Every `keys` document must be accepted at its current version. */
  async function resolveAccepted(
    accepted: LegalAcceptance[],
    keys: LegalKey[],
  ): Promise<CatalogEntry[]> {
    const entries = await loadCatalog();
    const currentVersions = Object.fromEntries(
      [...entries].map(([key, e]) => [key, e.current.version]),
    );
    const resolved: CatalogEntry[] = [];
    for (const key of keys) {
      const entry = entries.get(key);
      const given = accepted.find((a) => a.key === key);
      if (!entry || given?.version !== entry.current.version) {
        throw badRequest("Accept the current version of every document", { currentVersions });
      }
      resolved.push(entry);
    }
    return resolved;
  }

  async function record(
    userId: string,
    docs: CatalogEntry[],
    via: "signup" | "gate",
    request: RequestMeta,
  ): Promise<void> {
    await repo.createAcceptances(
      docs.map((d) => ({ userId, documentId: d.current.id, ipAddress: request.ip, via })),
    );
    for (const d of docs) {
      await audit.record({
        action: "legal.accepted",
        actor: { userId },
        target: { type: "legal_document", id: d.current.id },
        request,
        metadata: { key: d.current.doc.key, version: d.current.version, via },
      });
    }
  }

  return {
    /**
     * Inserts any version not seeded yet. Refuses to start if a seeded
     * version's text changed: published versions are immutable.
     */
    async seed(sources: LegalSource[]): Promise<void> {
      for (const s of sources) {
        const bodySha256 = createHash("sha256").update(s.body).digest("hex");
        const existing = await repo.findVersion(s.key, s.version);
        if (!existing) {
          try {
            await repo.create({
              key: s.key,
              version: s.version,
              title: s.title,
              body: s.body,
              bodySha256,
              requiresReacceptance: s.requiresReacceptance,
              publishedAt: new Date(s.publishedAt),
            });
          } catch (err) {
            // Another API instance seeded it at the same moment.
            if (!isUniqueViolation(err)) throw err;
          }
        } else if (existing.bodySha256 !== bodySha256) {
          throw new Error(
            `Legal document ${s.key} v${s.version} was edited after publishing. Add a new version instead.`,
          );
        }
      }
      catalog = undefined;
    },

    async current(): Promise<LegalDocument[]> {
      return [...(await loadCatalog()).values()].map((e) => e.current.doc);
    },

    pending,

    /** Signup must accept every current document. */
    async acceptAtSignup(userId: string, accepted: LegalAcceptance[], request: RequestMeta) {
      const docs = await resolveAccepted(accepted, [...(await loadCatalog()).keys()]);
      await record(userId, docs, "signup", request);
    },

    /** Checks signup acceptances before the account is created. */
    async assertSignupAcceptance(accepted: LegalAcceptance[]): Promise<void> {
      await resolveAccepted(accepted, [...(await loadCatalog()).keys()]);
    },

    /** The gate: must cover every pending document, at its current version. */
    async accept(userId: string, accepted: LegalAcceptance[], request: RequestMeta) {
      const keys = (await pending(userId)).map((p) => p.key);
      if (keys.length === 0) return;
      const docs = await resolveAccepted(accepted, keys);
      await record(userId, docs, "gate", request);
    },
  };
}

export type LegalService = ReturnType<typeof createLegalService>;
