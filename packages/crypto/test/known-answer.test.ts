// Known-answer tests: fixed inputs -> fixed expected outputs, stored as
// JSON in test/vectors/. The same vector files are run by the mobile
// native modules (Phase 7), which is what proves every platform derives
// and decrypts identically. Never regenerate a vector to make a test pass.
import { describe, expect, it } from "vitest";
import { CRYPTO_FORMAT_VERSION } from "../src/index";
import vectors from "./vectors/known-answer.json";

interface KnownAnswerCase {
  name: string;
  operation: string;
  input: Record<string, string>;
  expected: Record<string, string>;
}

const cases = vectors.cases as KnownAnswerCase[];

describe("known-answer vectors", () => {
  it("vector file matches the current format version", () => {
    expect(vectors.formatVersion).toBe(CRYPTO_FORMAT_VERSION);
  });

  it("every case is well-formed", () => {
    for (const c of cases) {
      expect(c.name).toBeTruthy();
      expect(c.operation).toBeTruthy();
      expect(c.input).toBeTypeOf("object");
      expect(c.expected).toBeTypeOf("object");
    }
  });

  // Phase 1: one `it` per case, dispatching on `operation` to the real
  // implementation (kdf.argon2id, item.encrypt, key.wrap, ...).
});
