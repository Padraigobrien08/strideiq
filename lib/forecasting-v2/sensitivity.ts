import { buildRaceForecastV2 } from "./forecastEngine";
import type { RaceForecastInput } from "./forecastTypes";

/**
 * Forecast sensitivity ("tornado") — how much each training lever would move the
 * most-likely time, holding everything else fixed. Each lever is perturbed by a
 * standard amount and the forecast re-run; the seconds delta is the leverage.
 * A local, single-athlete analysis: it re-runs the full model per lever.
 */

export interface SensitivityFactor {
  id: string;
  label: string;
  /** The perturbation applied, e.g. "+5 km" or "+1/wk". */
  change: string;
  /** Forecast change vs baseline; negative = faster (an improvement). */
  deltaSec: number;
  direction: "faster" | "slower" | "none";
}

export function computeForecastSensitivity(input: RaceForecastInput): SensitivityFactor[] {
  const baseline = buildRaceForecastV2(input).mostLikelyTimeSec;
  const ctx = input.athleteContext ?? {};

  const levers: { id: string; label: string; change: string; perturbed: RaceForecastInput }[] = [
    {
      id: "long_run",
      label: "Longest run",
      change: "+5 km",
      perturbed: {
        ...input,
        recentBlocks: input.recentBlocks.map((b) => ({
          ...b,
          longestRunKm: b.longestRunKm + 5,
        })),
      },
    },
    {
      id: "volume",
      label: "Weekly volume",
      change: "+10%",
      perturbed: {
        ...input,
        recentBlocks: input.recentBlocks.map((b) => ({
          ...b,
          distanceKm: Math.round(b.distanceKm * 1.1 * 10) / 10,
        })),
      },
    },
    {
      id: "quality",
      label: "Quality sessions",
      change: "+1/wk",
      perturbed: {
        ...input,
        athleteContext: { ...ctx, hardRunsLast14d: (ctx.hardRunsLast14d ?? 0) + 2 },
      },
    },
    {
      id: "freshness",
      label: "Freshness / taper",
      change: "+15",
      perturbed: {
        ...input,
        athleteContext: {
          ...ctx,
          freshnessScore: (ctx.freshnessScore ?? 50) + 15,
          tsb: (ctx.tsb ?? 0) + 5,
          // +5 raw TSB through the documented mapping (form = 1.25 × tsb − 2.5).
          formPct: ctx.formPct != null ? ctx.formPct + 6.25 : undefined,
        },
      },
    },
  ];

  return levers
    .map((l) => {
      const deltaSec = buildRaceForecastV2(l.perturbed).mostLikelyTimeSec - baseline;
      return {
        id: l.id,
        label: l.label,
        change: l.change,
        deltaSec,
        direction: (deltaSec < -1 ? "faster" : deltaSec > 1 ? "slower" : "none") as
          "faster" | "slower" | "none",
      };
    })
    .sort((a, b) => Math.abs(b.deltaSec) - Math.abs(a.deltaSec));
}
