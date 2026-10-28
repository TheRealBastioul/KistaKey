import sodium from "libsodium-wrappers-sumo";

let loaded = false;

/**
 * Loads libsodium (WebAssembly). Await once before any other call in this
 * package; calling it again is cheap.
 */
export async function ready(): Promise<void> {
  await sodium.ready;
  loaded = true;
}

/** libsodium, or a clear error if ready() hasn't finished yet. */
export function lib(): typeof sodium {
  if (!loaded) throw new Error("@repo/crypto: await ready() before using it");
  return sodium;
}

/** Overwrites key material in place once it's no longer needed (best effort in JS). */
export function wipe(...buffers: Uint8Array[]): void {
  for (const b of buffers) lib().memzero(b);
}
