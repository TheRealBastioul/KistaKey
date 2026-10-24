import type { ErrorCode, ErrorResponse } from "@repo/types";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

/**
 * The error type services throw for expected failures. The error handler
 * turns it into an ErrorResponse; anything else becomes a generic 500 so
 * internals never leak to clients.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Not allowed") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorResponse {
  return {
    error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
  };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody("NOT_FOUND", "Route not found", req.id));
  });

  app.setErrorHandler<Error>((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, "app error");
      return reply
        .status(err.statusCode)
        .send(errorBody(err.code, err.message, req.id, err.details));
    }

    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send(errorBody("VALIDATION_FAILED", "Invalid request", req.id, err.issues));
    }

    // Fastify's own errors (body parsing, schema validation, payload too large...).
    const fastifyErr = err as Partial<FastifyError>;
    if (fastifyErr.validation) {
      return reply
        .status(400)
        .send(errorBody("VALIDATION_FAILED", err.message, req.id, fastifyErr.validation));
    }
    const status = fastifyErr.statusCode ?? 500;
    if (status < 500) {
      return reply
        .status(status)
        .send(errorBody(CODE_BY_STATUS[status] ?? "BAD_REQUEST", err.message, req.id));
    }

    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(errorBody("INTERNAL", "Internal server error", req.id));
  });
}
