import type { DbHandles } from "../../db/types";

export type TokenPurpose = "email_verify" | "account_recovery";

// One-time tokens (email links, recovery step 2). Looked up by hash only:
// the token itself is the proof, and its row says whose it is.
export function createAuthRepository({ writer }: DbHandles) {
  return {
    createToken(data: {
      userId: string;
      purpose: TokenPurpose;
      tokenHash: string;
      expiresAt: Date;
    }) {
      return writer.oneTimeToken.create({ data });
    },

    /**
     * Uses a token once: returns its user id, or null if unknown, expired,
     * already used, or for another purpose. The conditional update makes
     * concurrent uses race-safe.
     */
    async consumeToken(
      purpose: TokenPurpose,
      tokenHash: string,
      now: Date,
    ): Promise<string | null> {
      const row = await writer.oneTimeToken.findUnique({ where: { tokenHash } });
      if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= now) return null;
      const { count } = await writer.oneTimeToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      return count === 1 ? row.userId : null;
    },

    async deleteExpiredTokens(before: Date): Promise<number> {
      const { count } = await writer.oneTimeToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: before } }, { usedAt: { lt: before } }] },
      });
      return count;
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
