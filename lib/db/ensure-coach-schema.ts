import { getSql } from "./client";

let ensured = false;

/** Creates coach preference tables if migration 002 was not applied yet. */
export async function ensureCoachSchema(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      default_weekly_runs INT NOT NULL DEFAULT 3,
      max_weekly_km REAL NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS user_race_goals (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      distance TEXT NOT NULL CHECK (distance IN ('5k', '10k', 'hm', 'marathon')),
      race_date DATE NOT NULL,
      target_time_sec INT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // 010_race_goal_name.sql, for databases created by this function rather than migrations.
  await sql`
    ALTER TABLE user_race_goals
      ADD COLUMN IF NOT EXISTS name TEXT CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 60)
  `;
  ensured = true;
}
