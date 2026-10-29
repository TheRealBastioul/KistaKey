// Typed RPC to the crypto worker: `await cryptoClient.call("unlockWithPassword", pw, keys)`.
// One worker for the whole app, started on first use. Errors come back as
// {name, message} and are rebuilt here, so `isDecryptionFailure` can tell a
// wrong password from a bug.
import type { CryptoOp, CryptoOps, WorkerRequest, WorkerResponse } from "./worker";

export class CryptoWorkerError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

/** True for a failed decryption (wrong password or recovery key): @repo/crypto's CryptoError. */
export function isDecryptionFailure(err: unknown): boolean {
  return err instanceof CryptoWorkerError && err.name === "CryptoError";
}

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const reply = event.data;
    const entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    if (reply.ok) entry.resolve(reply.result);
    else entry.reject(new CryptoWorkerError(reply.error.name, reply.error.message));
  };
  w.onerror = () => {
    // The worker failed to load or crashed: fail everything in flight and start fresh next time.
    for (const entry of pending.values()) {
      entry.reject(new CryptoWorkerError("WorkerError", "The crypto worker stopped"));
    }
    pending.clear();
    w.terminate();
    worker = undefined;
  };
  worker = w;
  return w;
}

export const cryptoClient = {
  call<K extends CryptoOp>(
    op: K,
    ...args: Parameters<CryptoOps[K]>
  ): Promise<Awaited<ReturnType<CryptoOps[K]>>> {
    const id = nextId++;
    const message: WorkerRequest = { id, op, args };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      getWorker().postMessage(message);
    });
  },
};
