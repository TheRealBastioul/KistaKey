import { describe, expect, it } from "vitest";
import { queueConnection, redisOptionsFromUrl } from "./redis";

describe("redisOptionsFromUrl", () => {
  it("parses host, port and db", () => {
    expect(redisOptionsFromUrl("redis://localhost:6380/2")).toEqual({
      host: "localhost",
      port: 6380,
      db: 2,
    });
  });

  it("defaults port and db", () => {
    expect(redisOptionsFromUrl("redis://cache")).toEqual({ host: "cache", port: 6379, db: 0 });
  });

  it("decodes credentials and enables TLS for rediss://", () => {
    const opts = redisOptionsFromUrl("rediss://user:p%40ss@cache.example.com:6390");
    expect(opts).toMatchObject({ username: "user", password: "p@ss", port: 6390, tls: {} });
  });

  it("rejects other schemes", () => {
    expect(() => redisOptionsFromUrl("http://localhost")).toThrow(/redis:\/\//);
  });

  it("queue connections disable per-request retries (BullMQ requirement)", () => {
    expect(queueConnection("redis://localhost").maxRetriesPerRequest).toBeNull();
  });
});
