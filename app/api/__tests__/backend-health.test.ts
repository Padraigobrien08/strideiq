import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/backend/health/route";
import { bffErrorResponse } from "@/lib/api-client/bff";

/**
 * The BFF connectivity probe. FastAPI itself is stubbed at `fetch`; the backend side of
 * the contract is covered by backend/tests.
 */

const HEALTH = {
  status: "ok",
  service: "strideiq-backend",
  api_version: "v1",
  environment: "local",
};

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://strideiq.test/api/backend/health", { headers });
}

let savedUrl: string | undefined;
beforeEach(() => {
  savedUrl = process.env.STRIDEIQ_BACKEND_URL;
  process.env.STRIDEIQ_BACKEND_URL = "http://127.0.0.1:8000";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.STRIDEIQ_BACKEND_URL;
  else process.env.STRIDEIQ_BACKEND_URL = savedUrl;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/backend/health", () => {
  it("reports the backend's health and propagates the correlation id", async () => {
    const fetchMock = vi.fn(async () => Response.json(HEALTH));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      request({ "x-request-id": "browser-req-0001", cookie: "strideiq_session=secret" }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("browser-req-0001");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", backend: HEALTH });
    expect(typeof body.latency_ms).toBe("number");

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const sent = init.headers as Record<string, string>;
    expect(sent["x-request-id"]).toBe("browser-req-0001");
    // The athlete's session cookie must never cross the service boundary.
    expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toContain("cookie");
  });

  it("returns a 503 envelope when the backend is not configured", async () => {
    delete process.env.STRIDEIQ_BACKEND_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(request());
    const id = res.headers.get("x-request-id");

    expect(res.status).toBe(503);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await res.json()).toEqual({
      error: "The StrideIQ backend is not configured.",
      code: "backend_not_configured",
      correlation_id: id,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a 502 envelope when the backend is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const res = await GET(request({ "x-request-id": "browser-req-0002" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "The StrideIQ backend could not be reached.",
      code: "backend_unreachable",
      correlation_id: "browser-req-0002",
    });
  });
});

describe("bffErrorResponse", () => {
  it("turns an unexpected error into a generic 500 envelope without its text", async () => {
    const res = bffErrorResponse(new Error("db password hunter2"), "browser-req-0003", "/x");
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("browser-req-0003");
    expect(await res.json()).toEqual({
      error: "Internal server error",
      code: "internal_error",
      correlation_id: "browser-req-0003",
    });
  });
});
