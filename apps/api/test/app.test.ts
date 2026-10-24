import { ErrorResponseSchema, HealthReadyResponseSchema } from "@repo/types";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const ok = async () => {};
const failing = async () => {
  throw new Error("down");
};

describe("app", () => {
  it("GET /health is ok and returns a request id", async () => {
    const app = await buildApp({ healthChecks: {} });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a well-formed incoming request id and replaces a malformed one", async () => {
    const app = await buildApp({ healthChecks: {} });

    const kept = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "trace-abc-12345" },
    });
    expect(kept.headers["x-request-id"]).toBe("trace-abc-12345");

    const replaced = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "bad id\n{inject}" },
    });
    expect(replaced.headers["x-request-id"]).not.toBe("bad id\n{inject}");
  });

  it("GET /health/ready is 200 when every check passes", async () => {
    const app = await buildApp({ healthChecks: { database: ok, redis: ok } });
    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(200);
    expect(HealthReadyResponseSchema.parse(res.json())).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("GET /health/ready is 503 and names the failing check", async () => {
    const app = await buildApp({ healthChecks: { database: ok, redis: failing } });
    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", checks: { database: "ok", redis: "fail" } });
  });

  it("unknown routes return the standard error body", async () => {
    const app = await buildApp({ healthChecks: {} });
    const res = await app.inject({ method: "GET", url: "/nope" });

    expect(res.statusCode).toBe(404);
    const body = ErrorResponseSchema.parse(res.json());
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(res.headers["x-request-id"]);
  });
});
