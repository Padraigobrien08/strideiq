import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendError,
  backendGet,
  resolveBackendUrl,
  resolveCorrelationId,
} from "@/lib/api-client/backend";

const CID = "test-correlation-01";
const LOCAL = { STRIDEIQ_BACKEND_URL: "http://127.0.0.1:8000" };
const HEALTH = {
  status: "ok",
  service: "strideiq-backend",
  api_version: "v1",
  environment: "local",
};

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function rejection(p: Promise<unknown>): Promise<BackendError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BackendError);
  return err as BackendError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCorrelationId", () => {
  it("reuses a well-formed inbound id", () => {
    expect(resolveCorrelationId("bff-req-1234abcd")).toBe("bff-req-1234abcd");
  });

  it("replaces missing or malformed ids with a UUID", () => {
    for (const bad of [null, undefined, "", "short", "<script>x</script>", "a\nb-cdefghij"]) {
      expect(resolveCorrelationId(bad)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("resolveBackendUrl", () => {
  it("is not configured when the variable is unset, blank or not http(s)", () => {
    for (const value of [undefined, "", "   ", "not a url", "ftp://127.0.0.1:8000"]) {
      const err = (() => {
        try {
          resolveBackendUrl(CID, { STRIDEIQ_BACKEND_URL: value });
        } catch (e) {
          return e as BackendError;
        }
      })();
      expect(err?.status).toBe(503);
      expect(err?.code).toBe("backend_not_configured");
    }
  });

  it("refuses non-loopback hosts until service auth exists (ADR 0001)", () => {
    for (const value of [
      "https://api.strideiq.example",
      "http://10.0.0.5:8000",
      "http://0.0.0.0",
    ]) {
      expect(() => resolveBackendUrl(CID, { STRIDEIQ_BACKEND_URL: value })).toThrow(
        expect.objectContaining({ status: 503, code: "backend_disabled" }),
      );
    }
  });

  it("accepts loopback hosts", () => {
    for (const value of ["http://127.0.0.1:8000", "http://localhost:8000", "http://[::1]:8000"]) {
      expect(resolveBackendUrl(CID, { STRIDEIQ_BACKEND_URL: value }).href).toContain(":8000");
    }
  });
});

describe("backendGet", () => {
  it("returns the typed body and sends only accept + correlation headers", async () => {
    const fetchMock = stubFetch(async () => json(HEALTH));
    const body = await backendGet("/api/v1/health", {
      correlationId: CID,
      timeoutMs: 500,
      env: LOCAL,
    });

    expect(body).toEqual(HEALTH);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8000/api/v1/health");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ accept: "application/json", "x-request-id": CID });
  });

  it("passes a backend error envelope through with its status", async () => {
    stubFetch(async () =>
      json({ error: "Not found", code: "not_found", correlation_id: CID }, 404),
    );
    const err = await rejection(
      backendGet("/api/v1/health", { correlationId: CID, timeoutMs: 500, env: LOCAL }),
    );
    expect(err.toBody()).toEqual({ error: "Not found", code: "not_found", correlation_id: CID });
    expect(err.status).toBe(404);
  });

  it("maps a non-envelope error or a non-JSON body to 502 bad_response", async () => {
    for (const res of [
      () => new Response("<html>gateway</html>", { status: 500 }),
      () => new Response("not json", { status: 200 }),
      () => json({ detail: "fastapi default" }, 500),
    ]) {
      stubFetch(async () => res());
      const err = await rejection(
        backendGet("/api/v1/health", { correlationId: CID, timeoutMs: 500, env: LOCAL }),
      );
      expect([err.status, err.code, err.correlationId]).toEqual([502, "backend_bad_response", CID]);
    }
  });

  it("maps a connection failure to 502 unreachable", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await rejection(
      backendGet("/api/v1/health", { correlationId: CID, timeoutMs: 500, env: LOCAL }),
    );
    expect([err.status, err.code]).toEqual([502, "backend_unreachable"]);
  });

  it("maps an exceeded budget to 504 timeout", async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const err = await rejection(
      backendGet("/api/v1/health", { correlationId: CID, timeoutMs: 20, env: LOCAL }),
    );
    expect([err.status, err.code]).toEqual([504, "backend_timeout"]);
  });

  it("never calls fetch when the backend is not configured", async () => {
    const fetchMock = stubFetch(async () => json(HEALTH));
    const err = await rejection(
      backendGet("/api/v1/health", { correlationId: CID, timeoutMs: 500, env: {} }),
    );
    expect(err.code).toBe("backend_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
