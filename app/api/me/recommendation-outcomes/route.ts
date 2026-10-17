import { NextRequest, NextResponse } from "next/server";
import { intelligenceContextFromRequest } from "@/lib/intelligence/auth";
import { computeAthleteIntelligence } from "@/lib/intelligence/service";
import { evaluateRecommendationOutcomes } from "@/lib/recommendation-outcomes/service";

export async function GET(req: NextRequest) {
  const ctx = await intelligenceContextFromRequest(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { analytics, runs } = await computeAthleteIntelligence(ctx);
    const result = await evaluateRecommendationOutcomes(ctx.userId, runs, analytics.workoutLabels, {
      // Too little history and the balance would be judged on noise.
      ...(analytics.fatigue.loadEvidence.sufficient
        ? { freshness: analytics.fatigue.freshness, tsb: analytics.fatigue.tsb }
        : {}),
      readinessScore: analytics.raceReadiness?.score,
      hardRuns14d: analytics.intensityAdvice.hardRunsLast14d,
      legFeel: ctx.legFeel,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to evaluate outcomes" },
      { status: 500 },
    );
  }
}
