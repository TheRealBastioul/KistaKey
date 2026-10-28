// Account-level flows built from the primitives: what signup, login,
// unlock, password change and recovery compute on the device. Inputs and
// outputs that go over the wire are base64url strings; raw keys stay as
// bytes and never leave the caller.
import { fromBase64Url, toBase64Url } from "./encoding";
import {
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  deriveSubKeys,
  generateSalt,
  type KdfParams,
} from "./kdf";
import {
  generateKeyPair,
  generateSymmetricKey,
  type KeyPair,
  keyPairFromPrivateKey,
  unwrapKey,
  wrapKey,
} from "./keys";
import {
  deriveRecoveryKeys,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
} from "./recovery";
import { wipe } from "./sodium";

/** Everything the server stores for the master password. */
export interface PasswordKeyMaterial {
  kdf: KdfParams;
  kdfSalt: string;
  authKey: string;
  encryptedUserKey: string;
}

/** Everything the server stores for the recovery key. */
export interface RecoveryKeyMaterial {
  recoveryWrappedUserKey: string;
  recoveryAuthKey: string;
}

export interface AccountKeyMaterial extends PasswordKeyMaterial, RecoveryKeyMaterial {
  publicKey: string;
  encryptedPrivateKey: string;
}

/** What unlock needs from the server (GET /auth/session). */
export interface StoredPasswordKeys {
  kdf: KdfParams;
  kdfSalt: string;
  encryptedUserKey: string;
}

async function passwordMaterial(
  password: string,
  userKey: Uint8Array,
  params: KdfParams,
): Promise<PasswordKeyMaterial> {
  const salt = generateSalt();
  const masterKey = deriveMasterKey(password, salt, params);
  const { authKey, encKey } = await deriveSubKeys(masterKey);
  const material = {
    kdf: { ...params },
    kdfSalt: toBase64Url(salt),
    authKey: toBase64Url(authKey),
    encryptedUserKey: wrapKey(encKey, userKey),
  };
  wipe(masterKey, authKey, encKey);
  return material;
}

async function recoveryMaterial(
  userKey: Uint8Array,
): Promise<{ recoveryKey: string; material: RecoveryKeyMaterial }> {
  const raw = generateRecoveryKey();
  const { authKey, wrapKey: recoveryWrapKey } = await deriveRecoveryKeys(raw);
  const result = {
    recoveryKey: formatRecoveryKey(raw),
    material: {
      recoveryWrappedUserKey: wrapKey(recoveryWrapKey, userKey),
      recoveryAuthKey: toBase64Url(authKey),
    },
  };
  wipe(raw, authKey, recoveryWrapKey);
  return result;
}

export interface NewAccount {
  material: AccountKeyMaterial;
  /** Formatted recovery key: show once, never store or send. */
  recoveryKey: string;
  userKey: Uint8Array;
}

/** Signup: every key is created here, on the device. */
export async function createAccount(
  password: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<NewAccount> {
  const userKey = generateSymmetricKey();
  const keyPair = generateKeyPair();
  const pw = await passwordMaterial(password, userKey, params);
  const recovery = await recoveryMaterial(userKey);
  const material: AccountKeyMaterial = {
    ...pw,
    ...recovery.material,
    publicKey: toBase64Url(keyPair.publicKey),
    encryptedPrivateKey: wrapKey(userKey, keyPair.privateKey),
  };
  wipe(keyPair.privateKey);
  return { material, recoveryKey: recovery.recoveryKey, userKey };
}

/**
 * Login: the authKey to send, plus the encKey to unwrap the user key with
 * once the session is up (so the password is only stretched once).
 */
export async function deriveLoginKeys(
  password: string,
  kdfSalt: string,
  params: KdfParams,
): Promise<{ authKey: string; encKey: Uint8Array }> {
  const masterKey = deriveMasterKey(password, fromBase64Url(kdfSalt), params);
  const { authKey, encKey } = await deriveSubKeys(masterKey);
  const authKeyText = toBase64Url(authKey);
  wipe(masterKey, authKey);
  return { authKey: authKeyText, encKey };
}

/** Unwraps the user key with an encKey from deriveLoginKeys. Wipes the encKey. */
export function unlockWithEncKey(encKey: Uint8Array, encryptedUserKey: string): Uint8Array {
  try {
    return unwrapKey(encKey, encryptedUserKey);
  } finally {
    wipe(encKey);
  }
}

/**
 * Unlock: fully local. A wrong password throws CryptoError("decryption
 * failed"), because the user key doesn't decrypt.
 */
export async function unlockWithPassword(
  password: string,
  stored: StoredPasswordKeys,
): Promise<Uint8Array> {
  const { encKey } = await deriveLoginKeys(password, stored.kdfSalt, stored.kdf);
  return unlockWithEncKey(encKey, stored.encryptedUserKey);
}

/**
 * Change master password: proves the current one locally (the user key must
 * unwrap), then wraps the same user key under the new one. Vault data is
 * untouched because the user key doesn't change.
 */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
  stored: StoredPasswordKeys,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{ currentAuthKey: string; next: PasswordKeyMaterial; userKey: Uint8Array }> {
  const current = await deriveLoginKeys(currentPassword, stored.kdfSalt, stored.kdf);
  const userKey = unlockWithEncKey(current.encKey, stored.encryptedUserKey);
  const next = await passwordMaterial(newPassword, userKey, params);
  return { currentAuthKey: current.authKey, next, userKey };
}

/** New recovery key for an unlocked account (Settings → regenerate recovery kit). */
export function rotateRecoveryKey(
  userKey: Uint8Array,
): Promise<{ recoveryKey: string; material: RecoveryKeyMaterial }> {
  return recoveryMaterial(userKey);
}

/** Recovery step 1: what to send to the server, and the key to keep locally. */
export async function startRecovery(
  recoveryKeyText: string,
): Promise<{ recoveryAuthKey: string; wrapKey: Uint8Array }> {
  const raw = parseRecoveryKey(recoveryKeyText);
  const { authKey, wrapKey: recoveryWrapKey } = await deriveRecoveryKeys(raw);
  const recoveryAuthKey = toBase64Url(authKey);
  wipe(raw, authKey);
  return { recoveryAuthKey, wrapKey: recoveryWrapKey };
}

/**
 * Recovery step 2: unwrap the user key with the recovery key, set a new
 * master password and issue a new recovery key (the old one is spent).
 */
export async function completeRecovery(
  recoveryWrapKey: Uint8Array,
  recoveryWrappedUserKey: string,
  newPassword: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{
  userKey: Uint8Array;
  material: PasswordKeyMaterial & RecoveryKeyMaterial;
  recoveryKey: string;
}> {
  const userKey = unwrapKey(recoveryWrapKey, recoveryWrappedUserKey);
  wipe(recoveryWrapKey);
  const pw = await passwordMaterial(newPassword, userKey, params);
  const recovery = await recoveryMaterial(userKey);
  return {
    userKey,
    material: { ...pw, ...recovery.material },
    recoveryKey: recovery.recoveryKey,
  };
}

/** The user's X25519 keypair (Phase 13+: opening keys shared to this user). */
export function unwrapPrivateKey(userKey: Uint8Array, encryptedPrivateKey: string): KeyPair {
  return keyPairFromPrivateKey(unwrapKey(userKey, encryptedPrivateKey));
}
