import { tenantWhere, type UserTenant } from "../../db/tenant";
import type { DbHandles } from "../../db/types";

export interface NewWebAuthnCredential {
  credentialId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  signCount: bigint;
  transports: string[];
  name: string;
}

// MFA reads go to `writer`: verification must see a code/credential that
// was just changed (replay protection depends on it).
export function createMfaRepository({ writer }: DbHandles) {
  return {
    // --- TOTP
    getTotp(tenant: UserTenant) {
      return writer.mfaTotp.findFirst({ where: tenantWhere(tenant) });
    },

    /** Starts (or restarts) setup: unconfirmed until the first code is entered. */
    upsertPendingTotp(tenant: UserTenant, encryptedSecret: string) {
      const where = tenantWhere(tenant);
      return writer.mfaTotp.upsert({
        where,
        create: { ...where, encryptedSecret },
        update: { encryptedSecret, confirmedAt: null, lastUsedStep: null },
      });
    },

    async confirmTotp(tenant: UserTenant, step: number, at: Date): Promise<boolean> {
      const { count } = await writer.mfaTotp.updateMany({
        where: { ...tenantWhere(tenant), confirmedAt: null },
        data: { confirmedAt: at, lastUsedStep: step },
      });
      return count > 0;
    },

    /**
     * Records a used step only if it's newer than the last one, atomically,
     * so two concurrent requests can't both use the same code.
     */
    async useTotpStep(tenant: UserTenant, step: number): Promise<boolean> {
      const { count } = await writer.mfaTotp.updateMany({
        where: {
          ...tenantWhere(tenant),
          confirmedAt: { not: null },
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
        },
        data: { lastUsedStep: step },
      });
      return count > 0;
    },

    async deleteTotp(tenant: UserTenant): Promise<number> {
      const { count } = await writer.mfaTotp.deleteMany({ where: tenantWhere(tenant) });
      return count;
    },

    // --- WebAuthn
    listWebAuthn(tenant: UserTenant) {
      return writer.webAuthnCredential.findMany({
        where: tenantWhere(tenant),
        orderBy: { createdAt: "asc" },
      });
    },

    createWebAuthn(tenant: UserTenant, data: NewWebAuthnCredential) {
      return writer.webAuthnCredential.create({ data: { ...tenantWhere(tenant), ...data } });
    },

    findWebAuthn(tenant: UserTenant, credentialId: string) {
      return writer.webAuthnCredential.findFirst({
        where: { ...tenantWhere(tenant), credentialId },
      });
    },

    updateWebAuthnUse(tenant: UserTenant, id: string, signCount: bigint, at: Date) {
      return writer.webAuthnCredential.updateMany({
        where: { ...tenantWhere(tenant), id },
        data: { signCount, lastUsedAt: at },
      });
    },

    async deleteWebAuthn(tenant: UserTenant, id: string): Promise<number> {
      const { count } = await writer.webAuthnCredential.deleteMany({
        where: { ...tenantWhere(tenant), id },
      });
      return count;
    },

    // --- Recovery codes
    replaceRecoveryCodes(tenant: UserTenant, codeHashes: string[]) {
      const where = tenantWhere(tenant);
      return writer.$transaction([
        writer.mfaRecoveryCode.deleteMany({ where }),
        writer.mfaRecoveryCode.createMany({
          data: codeHashes.map((codeHash) => ({ ...where, codeHash })),
        }),
      ]);
    },

    /** Marks a code used if it exists and is unused. True = it was valid. */
    async useRecoveryCode(tenant: UserTenant, codeHash: string, at: Date): Promise<boolean> {
      const { count } = await writer.mfaRecoveryCode.updateMany({
        where: { ...tenantWhere(tenant), codeHash, usedAt: null },
        data: { usedAt: at },
      });
      return count > 0;
    },

    countUnusedRecoveryCodes(tenant: UserTenant) {
      return writer.mfaRecoveryCode.count({ where: { ...tenantWhere(tenant), usedAt: null } });
    },
  };
}

export type MfaRepository = ReturnType<typeof createMfaRepository>;
