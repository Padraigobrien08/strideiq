-- Optional name for the race goal, e.g. "Edinburgh Half Marathon" (UI overhaul D6).
-- Today and Progress show it; without one they fall back to the distance label.
ALTER TABLE user_race_goals
  ADD COLUMN IF NOT EXISTS name TEXT CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 60);
