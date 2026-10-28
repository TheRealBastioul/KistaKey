import { beforeAll, describe, expect, it } from "vitest";
import {
  changeMasterPassword,
  completeRecovery,
  createAccount,
  deriveLoginKeys,
  rotateRecoveryKey,
  startRecovery,
  unlockWithPassword,
  unwrapPrivateKey,
} from "./account";
import { fromBase64Url, toBase64Url } from "./encoding";
import { CryptoError } from "./errors";
import { assertKdfParams, DEFAULT_KDF_PARAMS, type KdfParams } from "./kdf";
import { openSealed, seal } from "./keys";
import { formatRecoveryKey, parseRecoveryKey } from "./recovery";
import { ready } from "./sodium";

// The cheapest params clients accept, so the suite stays fast.
const FAST: KdfParams = { alg: "argon2id", memoryKiB: 19 * 1024, iterations: 2, parallelism: 1 };

beforeAll(ready);

describe("account flows", () => {
  it("signup material unlocks with the same password, not another", async () => {
    const { material, userKey } = await createAccount("correct horse", FAST);

    const unlocked = await unlockWithPassword("correct horse", material);
    expect(unlocked).toEqual(userKey);
    await expect(unlockWithPassword("wrong horse", material)).rejects.toThrow(CryptoError);
  });

  it("login derives the same authKey that signup sent", async () => {
    const { material } = await createAccount("correct horse", FAST);
    const login = await deriveLoginKeys("correct horse", material.kdfSalt, material.kdf);
    expect(login.authKey).toBe(material.authKey);
  });

  it("never puts the password or raw keys in the material", async () => {
    const { material, userKey, recoveryKey } = await createAccount("correct horse", FAST);
    const json = JSON.stringify(material);
    expect(json).not.toContain("correct horse");
    expect(json).not.toContain(toBase64Url(userKey));
    expect(json).not.toContain(recoveryKey);
    expect(json).not.toContain(toBase64Url(parseRecoveryKey(recoveryKey)));
  });

  it("the keypair's private key is wrapped by the user key", async () => {
    const { material, userKey } = await createAccount("pw", FAST);
    const keyPair = unwrapPrivateKey(userKey, material.encryptedPrivateKey);
    expect(toBase64Url(keyPair.publicKey)).toBe(material.publicKey);
    const secret = new Uint8Array(32).fill(7);
    expect(openSealed(keyPair, seal(fromBase64Url(material.publicKey), secret))).toEqual(secret);
  });

  it("change password keeps the user key and retires the old password", async () => {
    const { material, userKey } = await createAccount("old password", FAST);
    const { currentAuthKey, next } = await changeMasterPassword(
      "old password",
      "new password",
      material,
      FAST,
    );

    expect(currentAuthKey).toBe(material.authKey);
    expect(next.kdfSalt).not.toBe(material.kdfSalt);
    expect(await unlockWithPassword("new password", next)).toEqual(userKey);
    await expect(unlockWithPassword("old password", next)).rejects.toThrow(CryptoError);
  });

  it("change password fails locally when the current password is wrong", async () => {
    const { material } = await createAccount("old password", FAST);
    await expect(changeMasterPassword("nope", "new", material, FAST)).rejects.toThrow(CryptoError);
  });

  it("recovery restores the user key and issues a new recovery key", async () => {
    const { material, userKey, recoveryKey } = await createAccount("forgotten", FAST);

    const start = await startRecovery(recoveryKey.toLowerCase().replaceAll("-", " "));
    expect(start.recoveryAuthKey).toBe(material.recoveryAuthKey);

    const done = await completeRecovery(
      start.wrapKey,
      material.recoveryWrappedUserKey,
      "brand new",
      FAST,
    );
    expect(done.userKey).toEqual(userKey);
    expect(done.recoveryKey).not.toBe(recoveryKey);
    expect(await unlockWithPassword("brand new", done.material)).toEqual(userKey);

    const again = await startRecovery(done.recoveryKey);
    expect(again.recoveryAuthKey).toBe(done.material.recoveryAuthKey);
  });

  it("a wrong recovery key can't unwrap the user key", async () => {
    const a = await createAccount("a", FAST);
    const b = await createAccount("b", FAST);
    const start = await startRecovery(b.recoveryKey);
    await expect(
      completeRecovery(start.wrapKey, a.material.recoveryWrappedUserKey, "x", FAST),
    ).rejects.toThrow(CryptoError);
  });

  it("rotating the recovery key wraps the same user key", async () => {
    const { userKey } = await createAccount("pw", FAST);
    const rotated = await rotateRecoveryKey(userKey);
    const start = await startRecovery(rotated.recoveryKey);
    const done = await completeRecovery(
      start.wrapKey,
      rotated.material.recoveryWrappedUserKey,
      "pw2",
      FAST,
    );
    expect(done.userKey).toEqual(userKey);
  });
});

describe("KDF params", () => {
  it("defaults are 64 MiB, 3 iterations, 1 lane", () => {
    expect(DEFAULT_KDF_PARAMS).toEqual({
      alg: "argon2id",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 1,
    });
    expect(() => assertKdfParams(DEFAULT_KDF_PARAMS)).not.toThrow();
  });

  it.each([
    { memoryKiB: 1024 },
    { iterations: 1 },
    { parallelism: 4 },
    { memoryKiB: 2 * 1024 * 1024 },
    { iterations: 2.5 },
  ])("rejects weak or absurd params %o", (override) => {
    expect(() => assertKdfParams({ ...DEFAULT_KDF_PARAMS, ...override })).toThrow(CryptoError);
  });
});

describe("recovery key format", () => {
  it("formats as 13 groups of 4 and parses forgiving input", () => {
    const key = new Uint8Array(32).map((_, i) => i * 7);
    const formatted = formatRecoveryKey(key);
    expect(formatted).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(parseRecoveryKey(formatted.toLowerCase())).toEqual(key);
    expect(parseRecoveryKey(formatted.replaceAll("-", "  "))).toEqual(key);
    expect(parseRecoveryKey(formatted.replaceAll("0", "O").replaceAll("1", "l"))).toEqual(key);
  });

  it("rejects wrong length, bad characters and non-zero padding", () => {
    expect(() => parseRecoveryKey("ABCD")).toThrow(CryptoError);
    expect(() => parseRecoveryKey(`${"U".repeat(52)}`)).toThrow("invalid character");
    // The last char's 4 padding bits must be 0; "ZZZZ...Z" sets them.
    expect(() => parseRecoveryKey("Z".repeat(52))).toThrow("invalid");
  });
});
