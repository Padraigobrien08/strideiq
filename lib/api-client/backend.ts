import type { components, paths } from "./generated/backend";

/**
 * Server-to-server client for the FastAPI backend — the handwritten half of
 * `lib/api-client`. The other half, `generated/backend.ts`, is produced from the
 * backend's OpenAPI document by `npm run api:generate` and supplies every type here.
 *
 * **Server code only.** The browser never calls FastAPI; it calls a same-origin Next
 * route (the BFF), which calls this. `STRIDEIQ_BACKEND_URL` is deliberately not a
 * `NEXT_PUBLIC_` variable.
 *
 * Kept to a typed `fetch` wrapper rather than a client library: the generated types
 * already give path/response checking, and the runtime concerns that matter —
 * timeout, correlation ID, error envelope, no cookie forwarding — are a few lines that
 * are easier to audit here than to configure in a dependency.
 */

export type BackendErrorBody = components["schemas"]["ErrorResponse"];

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Per-class request budgets (total time, including reading the body). Ordinary reads
 * should be fast; plan generation calls an LLM; a Coach stream is a long-lived response.
 * Only `health` and `read` have callers in Milestone A — the rest are the agreed
 * defaults for the milestones that move those capabilities.
 */
export const BACKEND_TIMEOUTS_MS = {
  health: 2_000,
  read: 5_000,
  planGeneration: 30_000,
  stream: 120_000,
} as const;

/**
 * Milestone A has no service-to-service authentication (docs/adr/0001), so the BFF only
 * talks to a backend on this machine. A remote URL is refused rather than called
 * unauthenticated; lifting this is part of implementing the ADR.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Same rule as backend/app/correlation.py: anything else is replaced, never echoed. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId: string,
  ) {
    super(message);
    this.name = "BackendError";
  }

  toBody(): BackendErrorBody {
    return { error: this.message, code: this.code, correlation_id: this.correlationId };
  }
}

/** Reuse a well-formed inbound `x-request-id`, otherwise mint one. */
export function resolveCorrelationId(incoming: string | null | undefined): string {
  return incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

export function resolveBackendUrl(
  correlationId: string,
  env: Record<string, string | undefined> = process.env,
): URL {
  const raw = env.STRIDEIQ_BACKEND_URL?.trim();
  let url: URL | null = null;
  try {
    url = raw ? new URL(raw) : null;
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new BackendError(
      503,
      "backend_not_configured",
      "The StrideIQ backend is not configured.",
      correlationId,
    );
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new BackendError(
      503,
      "backend_disabled",
      "The StrideIQ backend is not enabled for remote traffic yet.",
      correlationId,
    );
  }
  return url;
}

/** Paths with a GET operation, and the JSON body of that operation's 200 response. */
type GetPath = {
  [P in keyof paths]: paths[P] extends { get: { responses: { 200: unknown } } } ? P : never;
}[keyof paths];
type GetOk<P extends GetPath> = paths[P]["get"]["responses"][200] extends {
  content: { "application/json": infer T };
}
  ? T
  : never;

function isErrorBody(value: unknown): value is BackendErrorBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.error === "string" &&
    typeof v.code === "string" &&
    typeof v.correlation_id === "string"
  );
}

export interface BackendRequestOptions {
  correlationId: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}

export async function backendGet<P extends GetPath>(
  path: P,
  { correlationId, timeoutMs, env }: BackendRequestOptions,
): Promise<GetOk<P>> {
  const base = resolveBackendUrl(correlationId, env);
  const url = new URL(path, base.origin);

  let status: number;
  let text: string;
  try {
    const res = await fetch(url, {
      method: "GET",
      // Built from scratch on purpose: browser cookies and auth headers are never
      // forwarded. Identity, when protected endpoints arrive, goes in an assertion the
      // BFF mints (ADR 0001), not in the athlete's session cookie.
      headers: { accept: "application/json", [REQUEST_ID_HEADER]: correlationId },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      // A redirect would send the request somewhere this module never validated.
      redirect: "error",
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new BackendError(
        504,
        "backend_timeout",
        "The StrideIQ backend took too long to respond.",
        correlationId,
      );
    }
    throw new BackendError(
      502,
      "backend_unreachable",
      "The StrideIQ backend could not be reached.",
      correlationId,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }

  if (status >= 200 && status < 300 && body !== undefined) return body as GetOk<P>;
  // A backend error already in the shared envelope passes through with its status.
  if (status >= 400 && isErrorBody(body)) {
    throw new BackendError(status, body.code, body.error, body.correlation_id);
  }
  throw new BackendError(
    502,
    "backend_bad_response",
    "The StrideIQ backend returned an unexpected response.",
    correlationId,
  );
}
