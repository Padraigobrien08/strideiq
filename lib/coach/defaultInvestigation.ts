import type { DashboardInsights } from "@/lib/analytics";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { ParsedCoachResponse } from "./parseResponse";

export const DEFAULT_INVESTIGATION_QUESTION = "Why did my readiness change this week?";

/** Client-side structured preload when no thread exists yet */
export function buildDefaultInvestigation(
  analytics: DashboardInsights,
  _raceGoal: RaceGoal | null,
): { question: string; parsed: ParsedCoachResponse } {
  const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const prev = analytics.previousWeek;
  const cur = analytics.currentWeek;
  const volDelta = prev != null ? cur.distanceKm - prev.distanceKm : null;

  const summaryParts: string[] = [];
  summaryParts.push(`Readiness is ${r.score}/100 (${r.label.toLowerCase()})`);
  if (analytics.fatigue.freshness >= 60) {
    summaryParts.push(`with ${analytics.fatigue.label.toLowerCase()} freshness`);
  }
  if (volDelta != null && Math.abs(volDelta) >= 2) {
    summaryParts.push(
      volDelta > 0
        ? `after volume increased versus ${prev!.weekLabel}`
        : `after volume eased versus ${prev!.weekLabel}`,
    );
  } else if (prev) {
    summaryParts.push(`with volume steady versus ${prev.weekLabel}`);
  }

  const evidence: string[] = [];
  if (prev) {
    evidence.push(
      `This week: ${cur.distanceKm.toFixed(1)} km · prior week: ${prev.distanceKm.toFixed(1)} km`,
    );
  } else {
    evidence.push(`This week: ${cur.distanceKm.toFixed(1)} km`);
  }
  evidence.push(
    `Longest recent run: ${r.longestRunKm.toFixed(1)} km · 4-week volume: ${r.fourWeekVolumeKm.toFixed(1)} km`,
  );
  evidence.push(
    `Freshness ${Math.round(analytics.fatigue.freshness)} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)} (${analytics.fatigue.label})`,
  );
  if (analytics.raceReadiness?.daysUntilRace != null) {
    evidence.push(
      `Race in ${analytics.raceReadiness.daysUntilRace} days: ${analytics.raceReadiness.distanceLabel}`,
    );
  }
  if (analytics.intensityAdvice.status === "too_hard") {
    evidence.push(`${analytics.intensityAdvice.hardRunsLast14d} hard sessions in the last 14 days`);
  }

  let recommendation =
    "Maintain aerobic rhythm and avoid stacking extra intensity before key sessions.";
  if (analytics.fatigue.formPct < -15) {
    recommendation = "Prioritize recovery density: ease the next hard session until TSB rebounds.";
  } else if (analytics.raceReadiness && analytics.raceReadiness.daysUntilRace <= 14) {
    recommendation =
      "Protect freshness: keep volume disciplined and prioritize race-specific work only.";
  } else if (analytics.efficiencySummary.trend === "improving") {
    recommendation =
      "Protect the positive efficiency trend with polarized easy days between quality work.";
  }

  const followUps = [
    "Compare with my prior race block",
    "Show fatigue trend over 4 weeks",
    "Explain race-week taper priorities",
    "Am I stacking too much intensity?",
  ];

  if (analytics.raceReadiness) {
    followUps[2] = `What should I prioritize ${analytics.raceReadiness.daysUntilRace} days before race?`;
  }

  return {
    question: DEFAULT_INVESTIGATION_QUESTION,
    parsed: {
      summary: summaryParts.join(", ") + ".",
      why: [
        volDelta != null && volDelta > 5
          ? "Volume rose meaningfully while freshness stayed supportive."
          : volDelta != null && volDelta < -5
            ? "Volume dropped, which often lifts freshness scores short-term."
            : "Readiness reflects stable long-run and block volume relative to your goal.",
        analytics.efficiencySummary.trend === "improving"
          ? "Aerobic efficiency trend is positive on recent HR-backed runs."
          : "Efficiency signal is flat: readiness is driven more by load balance than pace gains.",
      ],
      recommendation,
      confidence: `${analytics.dataConfidence.charAt(0).toUpperCase()}${analytics.dataConfidence.slice(1)}, grounded in volume, freshness, and readiness engines`,
      evidence,
      limitations: [
        "Preloaded from current analytics. Ask a follow-up for tool-backed session comparison.",
      ],
      followUps: followUps.slice(0, 4),
      memoryNotes: [],
      risks:
        analytics.intensityAdvice.status === "too_hard"
          ? ["Intensity concentration elevated in the last two weeks"]
          : [],
      historicalComparison: prev
        ? [
            `${prev.weekLabel}: ${prev.distanceKm.toFixed(1)} km vs ${cur.weekLabel}: ${cur.distanceKm.toFixed(1)} km`,
          ]
        : [],
      adaptation: [],
      raw: "",
      isStructured: true,
    },
  };
}
