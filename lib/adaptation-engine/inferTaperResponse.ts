import type { DashboardInsights } from "@/lib/analytics";
import type { AdaptationSignal } from "./types";

export function inferTaperResponse(analytics: DashboardInsights): AdaptationSignal[] {
  const r = analytics.raceReadiness;
  if (!r || r.daysUntilRace > 21) return [];

  const weeks = analytics.trainingBlocks;
  const volDrop =
    weeks.length >= 2 &&
    weeks[weeks.length - 1].distanceKm < weeks[weeks.length - 2].distanceKm * 0.85;

  if (!volDrop && r.daysUntilRace > 10) return [];

  const effective = analytics.fatigue.freshness >= 50 && analytics.fatigue.formPct > -12;

  return [
    {
      id: "taper-response",
      category: "recovery",
      statement: effective
        ? "Taper appears to be preserving freshness ahead of race"
        : "Taper volume reduced but freshness not yet clearly rebounding",
      confidence: r.daysUntilRace <= 7 ? "medium" : "low",
      supportingEvidence: [
        `${r.daysUntilRace}d to race`,
        `Freshness ${Math.round(analytics.fatigue.freshness)}`,
        volDrop ? "Volume down vs prior block" : "Race proximity",
      ],
      contradictoryEvidence:
        !effective && analytics.fatigue.formPct < -17 ? ["TSB still deeply negative"] : [],
      stability: effective ? "stable" : "emerging",
    },
  ];
}
