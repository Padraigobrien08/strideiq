import { getSql } from "./client";
import { ensureCoachSchema } from "./ensure-coach-schema";
import type { RaceGoal, RaceDistance } from "@/lib/analytics/readiness";
import type { IntelligenceSettings } from "@/lib/intelligence/types";

export interface UserPreferences {
  settings: IntelligenceSettings;
  raceGoal: RaceGoal | null;
}

const DEFAULTS: UserPreferences = {
  settings: { defaultWeeklyRuns: 3, maxWeeklyKm: 0 },
  raceGoal: null,
};

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const sql = getSql();
    const settingsRows = await sql`
      SELECT default_weekly_runs, max_weekly_km
      FROM user_settings
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const goalRows = await sql`
      SELECT distance, race_date, target_time_sec, name
      FROM user_race_goals
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;

    const settingsRow = settingsRows[0] as
      { default_weekly_runs: number; max_weekly_km: number } | undefined;
    const goalRow = goalRows[0] as
      | {
          distance: RaceDistance;
          race_date: string;
          target_time_sec: number | null;
          name: string | null;
        }
      | undefined;

    const settings: IntelligenceSettings = {
      defaultWeeklyRuns: settingsRow?.default_weekly_runs ?? 3,
      maxWeeklyKm: settingsRow?.max_weekly_km ?? 0,
    };

    const raceGoal: RaceGoal | null = goalRow
      ? {
          distance: goalRow.distance,
          date:
            typeof goalRow.race_date === "string"
              ? goalRow.race_date.slice(0, 10)
              : new Date(goalRow.race_date).toISOString().slice(0, 10),
          ...(goalRow.target_time_sec ? { targetTimeSec: goalRow.target_time_sec } : {}),
          ...(goalRow.name ? { name: goalRow.name } : {}),
        }
      : null;

    return { settings, raceGoal };
  } catch {
    return DEFAULTS;
  }
}

export async function upsertUserSettings(
  userId: string,
  settings: Partial<IntelligenceSettings>,
): Promise<void> {
  await ensureCoachSchema();
  const sql = getSql();
  const current = await getUserPreferences(userId);
  const merged = { ...current.settings, ...settings };
  await sql`
    INSERT INTO user_settings (user_id, default_weekly_runs, max_weekly_km, updated_at)
    VALUES (
      ${userId}::uuid,
      ${merged.defaultWeeklyRuns},
      ${merged.maxWeeklyKm},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      default_weekly_runs = EXCLUDED.default_weekly_runs,
      max_weekly_km = EXCLUDED.max_weekly_km,
      updated_at = NOW()
  `;
}

export async function upsertUserRaceGoal(userId: string, goal: RaceGoal | null): Promise<void> {
  await ensureCoachSchema();
  const sql = getSql();
  if (!goal) {
    await sql`DELETE FROM user_race_goals WHERE user_id = ${userId}::uuid`;
    return;
  }
  await sql`
    INSERT INTO user_race_goals (user_id, distance, race_date, target_time_sec, name, updated_at)
    VALUES (
      ${userId}::uuid,
      ${goal.distance},
      ${goal.date}::date,
      ${goal.targetTimeSec ?? null},
      ${goal.name?.trim() || null},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      distance = EXCLUDED.distance,
      race_date = EXCLUDED.race_date,
      target_time_sec = EXCLUDED.target_time_sec,
      name = EXCLUDED.name,
      updated_at = NOW()
  `;
}
