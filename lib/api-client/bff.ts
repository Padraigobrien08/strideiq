import { NextResponse } from "next/server";
import { logger, serializeError } from "@/lib/observability/logger";
import { BackendError, REQUEST_ID_HEADER, resolveCorrelationId } from "./backend";

/**
 * Glue for BFF route handlers: correlation ID in, error envelope out.
 *
 * The envelope is `{ error, code, correlation_id }` — a superset of the `{ error }` the
 * UI already reads from every Next route, so existing callers keep working.
 */

export function correlationIdFor(req: Request): string {
  return resolveCorrelationId(req.headers.get(REQUEST_ID_HEADER));
}

export function bffJson(body: unknown, correlationId: string, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set(REQUEST_ID_HEADER, correlationId);
  res.headers.set("cache-control", "no-store");
  return res;
}

export function bffErrorResponse(err: unknown, correlationId: string, route: string): NextResponse {
  const error =
    err instanceof BackendError
      ? err
      : new BackendError(500, "internal_error", "Internal server error", correlationId);
  const fields = {
    event: "bff.backend_error",
    route,
    correlation_id: correlationId,
    status: error.status,
    code: error.code,
  };
  if (err instanceof BackendError) logger.warn(fields);
  else logger.error({ ...fields, error: serializeError(err) });
  return bffJson(error.toBody(), correlationId, { status: error.status });
}
