import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth/session";

/**
 * Input-validation contracts on the authenticated write paths (§F-5).
 *
 * These run as a *signed-in* user, so they get past auth and exercise the
 * validation each route actually applies. Persistence is mocked: the subject here
 * is the request contract — status codes and rejection of malformed input — not
 * the database.
 */

const SECRET = "test-session-secret-at-least-16";
const USER = "11111111-1111-1111-1111-111111111111";

const cookieStore = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "strideiq_session" && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

// --- persistence stubs ---
const upsertLegFeel = vi.fn();
const getLegFeel = vi.fn();
vi.mock("@/lib/db/leg-feel", () => ({
  upsertLegFeel: (...a: unknown[]) => upsertLegFeel(...a),
  getLegFeel: (...a: unknown[]) => getLegFeel(...a),
}));

const getUserPreferences = vi.fn();
const saveUserPreferences = vi.fn();
const upsertUserSettings = vi.fn();
const upsertUserRaceGoal = vi.fn();
vi.mock("@/lib/db/user-preferences", () => ({
  getUserPreferences: (...a: unknown[]) => getUserPreferences(...a),
  saveUserPreferences: (...a: unknown[]) => saveUserPreferences(...a),
  upsertUserSettings: (...a: unknown[]) => upsertUserSettings(...a),
  upsertUserRaceGoal: (...a: unknown[]) => upsertUserRaceGoal(...a),
}));

const getSavedWeeks = vi.fn();
const upsertSavedWeek = vi.fn();
const deleteSavedWeek = vi.fn();
vi.mock("@/lib/db/training-calendar", () => ({
  getSavedWeeks: (...a: unknown[]) => getSavedWeeks(...a),
  upsertSavedWeek: (...a: unknown[]) => upsertSavedWeek(...a),
  deleteSavedWeek: (...a: unknown[]) => deleteSavedWeek(...a),
}));

function post(path: string, body: unknown, raw = false) {
  return new NextRequest(`https://example.com${path}`, {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  cookieStore.value = createSessionToken(USER);
  for (const m of [
    upsertLegFeel,
    getLegFeel,
    getUserPreferences,
    saveUserPreferences,
    upsertUserSettings,
    upsertUserRaceGoal,
    getSavedWeeks,
    upsertSavedWeek,
    deleteSavedWeek,
  ]) {
    m.mockReset().mockResolvedValue(null);
  }
  getSavedWeeks.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  cookieStore.value = undefined;
});

describe("POST /api/me/leg-feel", () => {
  const valid = {
    report: { legs: "heavy", source: "morning", reportedAt: "2026-08-05T07:00:00.000Z" },
  };

  it("accepts a valid report and persists it", async () => {
    const { POST } = await import("../me/leg-feel/route");
    const res = await POST(post("/api/me/leg-feel", valid));
    expect(res.status).toBe(200);
    expect(upsertLegFeel).toHaveBeenCalledWith(USER, expect.any(String), valid.report);
  });

  it("returns 400 on an unparseable body without touching the database", async () => {
    const { POST } = await import("../me/leg-feel/route");
    const res = await POST(post("/api/me/leg-feel", "{not json", true));
    expect(res.status).toBe(400);
    expect(upsertLegFeel).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown legs value", { report: { ...valid.report, legs: "wrecked" } }],
    ["missing legs", { report: { source: "morning", reportedAt: "2026-08-05T07:00:00.000Z" } }],
    ["bad source", { report: { ...valid.report, source: "telepathy" } }],
    [
      "niggle severity out of range",
      { report: { ...valid.report, niggle: { area: "calf", severity: 9 } } },
    ],
    ["note too long", { report: { ...valid.report, note: "x".repeat(281) } }],
    ["malformed date", { date: "05-08-2026", report: valid.report }],
    ["empty object", {}],
  ])("returns 422 for %s", async (_label, body) => {
    const { POST } = await import("../me/leg-feel/route");
    const res = await POST(post("/api/me/leg-feel", body));
    expect(res.status).toBe(422);
    expect(upsertLegFeel).not.toHaveBeenCalled();
  });

  it("rejects a bad date on GET", async () => {
    const { GET } = await import("../me/leg-feel/route");
    const res = await GET(new NextRequest("https://example.com/api/me/leg-feel?date=nonsense"));
    expect(res.status).toBe(400);
  });

  it("scopes the read to the session user", async () => {
    getLegFeel.mockResolvedValue({ legs: "fresh" });
    const { GET } = await import("../me/leg-feel/route");
    await GET(new NextRequest("https://example.com/api/me/leg-feel?date=2026-08-05"));
    expect(getLegFeel).toHaveBeenCalledWith(USER, "2026-08-05");
  });
});

describe("POST /api/me/preferences", () => {
  it("rejects an unparseable body", async () => {
    const { POST } = await import("../me/preferences/route");
    const res = await POST(post("/api/me/preferences", "nope", true));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(saveUserPreferences).not.toHaveBeenCalled();
  });

  it("accepts a race name and rejects one that is blank or too long", async () => {
    const { POST } = await import("../me/preferences/route");
    const goal = { distance: "hm", date: "2026-12-20" };
    const ok = await POST(
      post("/api/me/preferences", { raceGoal: { ...goal, name: "Edinburgh Half Marathon" } }),
    );
    expect(ok.status).toBe(200);
    expect(upsertUserRaceGoal.mock.calls[0]?.[1]).toMatchObject({
      name: "Edinburgh Half Marathon",
    });
    for (const name of ["   ", "x".repeat(61)]) {
      const res = await POST(post("/api/me/preferences", { raceGoal: { ...goal, name } }));
      expect(res.status, JSON.stringify(name)).toBeGreaterThanOrEqual(400);
      expect(res.status, JSON.stringify(name)).toBeLessThan(500);
    }
  });

  it("rejects a structurally invalid payload", async () => {
    const { POST } = await import("../me/preferences/route");
    const res = await POST(post("/api/me/preferences", { raceGoal: { distance: 12345 } }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("reads preferences for the session user only", async () => {
    getUserPreferences.mockResolvedValue({});
    const { GET } = await import("../me/preferences/route");
    await GET();
    expect(getUserPreferences).toHaveBeenCalledWith(USER);
  });
});

describe("/api/me/training-calendar", () => {
  it("rejects an invalid week payload", async () => {
    const { POST } = await import("../me/training-calendar/route");
    const res = await POST(post("/api/me/training-calendar", { weekStart: "not-a-date" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(upsertSavedWeek).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body", async () => {
    const { POST } = await import("../me/training-calendar/route");
    const res = await POST(post("/api/me/training-calendar", "{", true));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(upsertSavedWeek).not.toHaveBeenCalled();
  });

  it("scopes reads to the session user", async () => {
    const { GET } = await import("../me/training-calendar/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getSavedWeeks).toHaveBeenCalledWith(USER);
  });

  it("will not delete another user's week", async () => {
    const { DELETE } = await import("../me/training-calendar/route");
    const res = await DELETE(
      new NextRequest("https://example.com/api/me/training-calendar?weekStart=2026-08-03", {
        method: "DELETE",
      }),
    );
    if (res.status < 400) {
      // Whatever the shape of the request, the user id must come from the session.
      expect(deleteSavedWeek).toHaveBeenCalledWith(USER, expect.anything());
    }
  });
});
