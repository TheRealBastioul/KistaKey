// Crypto Web Worker: every Argon2id / libsodium call runs here, off the UI
// thread. The main thread talks to it only through ./client.ts. Raw keys
// that come back are copies; the worker wipes its own copies after replying.
import {
  changeMasterPassword,
  completeRecovery,
  createAccount,
  decryptFolderName,
  decryptItem,
  decryptVaultExport,
  deriveLoginKeys,
  encryptFolderName,
  encryptItem,
  encryptVaultExport,
  ready,
  rotateRecoveryKey,
  startRecovery,
  totpCode,
  unlockWithEncKey,
  unlockWithPassword,
  wipe,
} from "@repo/crypto";

/** The parts of a wire item the worker needs to decrypt it. */
export interface EncryptedItemRef {
  id: string;
  encryptedKey: string;
  encryptedData: string;
}

/** `data` is unvalidated JSON (the caller parses it); `ok: false` = couldn't decrypt. */
export interface DecryptedItemResult {
  id: string;
  data: unknown;
  ok: boolean;
}

export interface DecryptedFolderResult {
  id: string;
  name: string | null;
}

const ops = {
  /** Signup. The user key isn't returned: signup doesn't log in, so it's wiped here. */
  async createAccount(password: string) {
    const account = await createAccount(password);
    wipe(account.userKey);
    return { material: account.material, recoveryKey: account.recoveryKey };
  },
  deriveLoginKeys,
  unlockWithEncKey,
  unlockWithPassword,
  changeMasterPassword,
  rotateRecoveryKey,
  startRecovery,
  completeRecovery,

  /** A sync batch. One bad item doesn't fail the rest: it comes back `ok: false`. */
  decryptItems(userKey: Uint8Array, items: EncryptedItemRef[]): DecryptedItemResult[] {
    return items.map((item) => {
      try {
        return { id: item.id, data: decryptItem(userKey, item.id, item), ok: true };
      } catch {
        return { id: item.id, data: null, ok: false };
      }
    });
  },
  decryptFolders(
    userKey: Uint8Array,
    folders: { id: string; encryptedName: string }[],
  ): DecryptedFolderResult[] {
    return folders.map((folder) => {
      try {
        return { id: folder.id, name: decryptFolderName(userKey, folder.id, folder.encryptedName) };
      } catch {
        return { id: folder.id, name: null };
      }
    });
  },
  /** New item without `encryptedKey`; an edit passes the current one to keep the item key. */
  encryptItem,
  encryptFolderName,
  /** WebCrypto only, but it lives here so the main thread never loads @repo/crypto. */
  totpCode,

  /** One import chunk: new items (fresh item keys) and folders, in one round trip. */
  encryptImportBatch(
    userKey: Uint8Array,
    items: { id: string; data: unknown }[],
    folders: { id: string; name: string }[],
  ) {
    return {
      items: items.map((item) => ({ id: item.id, ...encryptItem(userKey, item.id, item.data) })),
      folders: folders.map((folder) => ({
        id: folder.id,
        encryptedName: encryptFolderName(userKey, folder.id, folder.name),
      })),
    };
  },
  /** Account-bound encrypted backup (decisions §21). */
  encryptVaultExport,
  decryptVaultExport,
};

export type CryptoOps = typeof ops;
export type CryptoOp = keyof CryptoOps;

export interface WorkerRequest {
  id: number;
  op: CryptoOp;
  args: unknown[];
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { name: string; message: string } };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const loaded = ready();

/** Every Uint8Array inside a result (one level of nesting is all the ops use). */
function byteArrays(value: unknown): Uint8Array[] {
  if (value instanceof Uint8Array) return [value];
  if (value && typeof value === "object") {
    return Object.values(value).filter((v): v is Uint8Array => v instanceof Uint8Array);
  }
  return [];
}

async function handle({ id, op, args }: WorkerRequest): Promise<void> {
  try {
    await loaded;
    const fn = ops[op] as unknown as (...a: unknown[]) => unknown;
    const result = await fn(...args);
    // Structured clone copies the bytes into the reply, so the originals can go.
    scope.postMessage({ id, ok: true, result });
    wipe(...byteArrays(result));
  } catch (err) {
    const error =
      err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: "Error", message: "crypto operation failed" };
    scope.postMessage({ id, ok: false, error });
  } finally {
    // Byte arguments (encKey, wrapKey, userKey) are copies sent by the main thread.
    for (const arg of args) if (arg instanceof Uint8Array) arg.fill(0);
  }
}

scope.onmessage = (event) => {
  void handle(event.data);
};
