import { z } from "zod";

export const HealthCheckStatusSchema = z.enum(["ok", "fail"]);

/** GET /health: liveness. The process is up; says nothing about dependencies. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** GET /health/ready: readiness. 200 when every dependency answers, 503 otherwise. */
export const HealthReadyResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.record(z.string(), HealthCheckStatusSchema),
});
export type HealthReadyResponse = z.infer<typeof HealthReadyResponseSchema>;
