import type { DbHandles } from "../../db/types";

/** Columns written when the master password changes (signup, password change, recovery). */
export interface PasswordColumns {
  kdfAlg: string;
  kdfMemoryKib: number;
  kdfIterations: number;
  kdfParallelism: number;
  kdfSalt: string;
  authHash: string;
  encryptedUserKey: string;
}

export interface RecoveryColumns {
  recoveryWrappedUserKey: string;
  recoveryAuthHash: string;
}

export interface NewUser extends PasswordColumns, RecoveryColumns {
  email: string;
  publicKey: string;
  encryptedPrivateKey: string;
  securityStamp: string;
}

// The users table is the tenant root: a user's own row is looked up by its
// id (from the session) or by email (login/prelogin/recovery only).
// Auth reads go to `writer`: a login right after signup must see the row.
export function createUsersRepository({ writer }: DbHandles) {
  return {
    findByEmail(email: string) {
      return writer.user.findUnique({ where: { email } });
    },

    findById(id: string) {
      return writer.user.findUnique({ where: { id } });
    },

    /** Status + stamp + whether any MFA method is set up (the auth gates need all three). */
    findState(id: string) {
      return writer.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          status: true,
          securityStamp: true,
          mfaTotp: { select: { confirmedAt: true } },
          _count: { select: { webauthnCredentials: true } },
        },
      });
    },

    create(data: NewUser) {
      return writer.user.create({ data });
    },

    markEmailVerified(id: string, at: Date) {
      return writer.user.updateMany({
        where: { id, emailVerifiedAt: null },
        data: { emailVerifiedAt: at },
      });
    },

    updatePassword(id: string, columns: PasswordColumns, securityStamp: string) {
      return writer.user.update({ where: { id }, data: { ...columns, securityStamp } });
    },

    updateRecovery(id: string, columns: RecoveryColumns) {
      return writer.user.update({ where: { id }, data: columns });
    },

    updatePasswordAndRecovery(
      id: string,
      password: PasswordColumns,
      recovery: RecoveryColumns,
      securityStamp: string,
    ) {
      return writer.user.update({
        where: { id },
        data: { ...password, ...recovery, securityStamp },
      });
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
