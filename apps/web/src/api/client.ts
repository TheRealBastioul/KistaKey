// Fetch wrapper for the API. Cookie session (credentials: "include"), CSRF
// header on unsafe methods (fetched once, refetched once on CSRF_INVALID),
// ErrorResponse → ApiError, and a 401 notification so the app can drop back
// to the login page. In dev, Vite proxies /api to the API.
import { type ErrorCode, ErrorResponseSchema } from "@repo/types";

const BASE = "/api";
const SAFE_METHODS = new Set(["GET", "HEAD"]);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken: string | undefined;
const unauthorizedListeners = new Set<() => void>();

/** Called on any 401 from a signed-in request (session expired or revoked). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: "include" });
  const body = (await res.json()) as { token?: string };
  if (!res.ok || !body.token)
    throw new ApiError(res.status, "INTERNAL", "Couldn't start a request");
  csrfToken = body.token;
  return body.token;
}

export interface RequestOptions<T> {
  body?: unknown;
  /** A zod schema from @repo/types; the response is parsed with it. */
  schema?: { parse(input: unknown): T };
  /** Signed-out endpoints: a 401 is an answer (e.g. wrong password), not an expired session. */
  public?: boolean;
  signal?: AbortSignal;
}

export async function request<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: RequestOptions<T> = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (!SAFE_METHODS.has(method)) headers["x-csrf-token"] = csrfToken ?? (await fetchCsrfToken());

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection.");
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(json);
    const error = parsed.success
      ? new ApiError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.details,
        )
      : new ApiError(res.status, "INTERNAL", "Something went wrong. Try again.");

    if (error.code === "CSRF_INVALID" && !retried) {
      csrfToken = undefined;
      return request(method, path, options, true);
    }
    if (res.status === 401 && !options.public) {
      for (const listener of unauthorizedListeners) listener();
    }
    throw error;
  }

  return options.schema ? options.schema.parse(json) : (json as T);
}

/** A human message for any error thrown by request(). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "VALIDATION_FAILED") return "Some fields aren't valid. Check and try again.";
    return err.message;
  }
  return "Something went wrong. Try again.";
}
