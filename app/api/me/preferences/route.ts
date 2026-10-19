import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import {
  getUserPreferences,
  upsertUserRaceGoal,
  upsertUserSettings,
} from "@/lib/db/user-preferences";
import { RACE_NAME_MAX_LENGTH, type RaceGoal } from "@/lib/analytics/readiness";
import { z } from "zod";

const bodySchema = z.object({
  defaultWeeklyRuns: z.number().int().min(1).max(14).optional(),
  maxWeeklyKm: z.number().min(0).optional(),
  raceGoal: z
    .object({
      distance: z.enum(["5k", "10k", "hm", "marathon"]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      targetTimeSec: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(RACE_NAME_MAX_LENGTH).optional(),
    })
    .nullable()
    .optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const prefs = await getUserPreferences(userId);
    return NextResponse.json(prefs);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  try {
    const body = parsed.data;
    if (body.defaultWeeklyRuns !== undefined || body.maxWeeklyKm !== undefined) {
      await upsertUserSettings(userId, {
        ...(body.defaultWeeklyRuns !== undefined
          ? { defaultWeeklyRuns: body.defaultWeeklyRuns }
          : {}),
        ...(body.maxWeeklyKm !== undefined ? { maxWeeklyKm: body.maxWeeklyKm } : {}),
      });
    }
    if (body.raceGoal !== undefined) {
      await upsertUserRaceGoal(userId, body.raceGoal as RaceGoal | null);
    }
    const prefs = await getUserPreferences(userId);
    return NextResponse.json(prefs);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save preferences" },
      { status: 500 },
    );
  }
}
