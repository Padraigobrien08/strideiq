import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb } from "./testDatabase";
import { getSql } from "../client";
import { ensureCoachSchema } from "../ensure-coach-schema";
import { getUserPreferences, upsertUserRaceGoal } from "../user-preferences";

// Opt-in and local-only: these tests DELETE rows. See testDatabase.ts.
const TEST_USER = "00000000-0000-0000-0000-0000000000d6";

describe.skipIf(!hasTestDb)("race goal persistence (overhaul D6: race name)", () => {
  beforeAll(async () => {
    await ensureCoachSchema();
    await getSql()`
      INSERT INTO users (id, email) VALUES (${TEST_USER}::uuid, 'd6-test@example.com')
      ON CONFLICT (id) DO NOTHING
    `;
  });

  afterAll(async () => {
    try {
      await getSql()`DELETE FROM user_race_goals WHERE user_id = ${TEST_USER}::uuid`;
      await getSql()`DELETE FROM users WHERE id = ${TEST_USER}::uuid`.catch(() => {});
    } catch {
      /* ignore cleanup errors */
    }
  });

  it("round-trips a named race goal", async () => {
    await upsertUserRaceGoal(TEST_USER, {
      distance: "hm",
      date: "2026-12-20",
      targetTimeSec: 6300,
      name: "Edinburgh Half Marathon",
    });
    const { raceGoal } = await getUserPreferences(TEST_USER);
    expect(raceGoal).toEqual({
      distance: "hm",
      date: "2026-12-20",
      targetTimeSec: 6300,
      name: "Edinburgh Half Marathon",
    });
  });

  it("clears the name when a goal is saved without one", async () => {
    await upsertUserRaceGoal(TEST_USER, { distance: "10k", date: "2027-01-10" });
    const { raceGoal } = await getUserPreferences(TEST_USER);
    expect(raceGoal).toEqual({ distance: "10k", date: "2027-01-10" });
  });

  it("refuses a name over 60 characters at the database too", async () => {
    await expect(
      getSql()`
        UPDATE user_race_goals SET name = ${"x".repeat(61)} WHERE user_id = ${TEST_USER}::uuid
      `,
    ).rejects.toThrow();
  });
});
