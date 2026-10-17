import type { NextRequest } from "next/server";
import { BACKEND_TIMEOUTS_MS, backendGet } from "@/lib/api-client/backend";
import { bffErrorResponse, bffJson, correlationIdFor } from "@/lib/api-client/bff";

export const dynamic = "force-dynamic";

/**
 * BFF connectivity probe: browser → this route → FastAPI `GET /api/v1/health`.
 *
 * Separate from `/api/health`, which reports the Next app's own configuration. This one
 * proves the server-to-server hop works and reports its latency. No user capability
 * depends on the backend yet.
 */
export async function GET(req: NextRequest) {
  const correlationId = correlationIdFor(req);
  const started = performance.now();
  try {
    const backend = await backendGet("/api/v1/health", {
      correlationId,
      timeoutMs: BACKEND_TIMEOUTS_MS.health,
    });
    return bffJson(
      { status: "ok", backend, latency_ms: Math.round(performance.now() - started) },
      correlationId,
    );
  } catch (err) {
    return bffErrorResponse(err, correlationId, "/api/backend/health");
  }
}
