import type { DashboardInsights } from "@/lib/analytics";
import type { AttributedDriver, DriverAttribution, AttributionTarget } from "./types";

function driver(
  partial: Omit<AttributedDriver, "evidence"> & { evidence: string[] },
): AttributedDriver {
  return partial;
}

export function inferLikelyDrivers(
  analytics: DashboardInsights,
  phenomenon: AttributionTarget,
  opts?: { priorReadiness?: number; priorFreshness?: number },
): DriverAttribution {
  const drivers: AttributedDriver[] = [];
  const uncertainties: string[] = [];

  if (analytics.dataConfidence === "low" || analytics.summary.runCount < 8) {
    uncertainties.push("Limited training history: driver attribution is tentative");
  }
  if (analytics.dataConfidence === "low") {
    uncertainties.push("Low data confidence may obscure load and efficiency drivers");
  }

  switch (phenomenon) {
    case "readiness": {
      const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
      const daysUntil = analytics.raceReadiness?.daysUntilRace;
      const delta = opts?.priorReadiness != null ? r.score - opts.priorReadiness : null;

      if (analytics.fatigue.freshness >= 60) {
        drivers.push(
          driver({
            driver: "Elevated freshness",
            impact: "moderate",
            confidence: "medium",
            evidence: [
              `Freshness ${Math.round(analytics.fatigue.freshness)}`,
              analytics.fatigue.label,
            ],
          }),
        );
      }
      if (daysUntil != null && daysUntil <= 14) {
        drivers.push(
          driver({
            driver: "Race-proximity taper",
            impact: "moderate",
            confidence: "low",
            evidence: [`${daysUntil} days to race`, "Volume likely reduced"],
          }),
        );
      }
      if (analytics.efficiencySummary.trend === "improving") {
        drivers.push(
          driver({
            driver: "Improving aerobic efficiency",
            impact: "small",
            confidence: "low",
            evidence: ["Efficiency trend improving"],
          }),
        );
      }
      if (analytics.intensityAdvice.status === "too_hard") {
        drivers.push(
          driver({
            driver: "Intensity stacking",
            impact: "moderate",
            confidence: "medium",
            evidence: [`${analytics.intensityAdvice.hardRunsLast14d} hard runs / 14d`],
          }),
        );
        uncertainties.push("Stacking may suppress readiness if maintained");
      }
      if (delta != null && Math.abs(delta) < 3) {
        uncertainties.push("Readiness change is small: multiple factors may cancel");
      }

      return {
        phenomenon: "Readiness change",
        likelyDrivers: drivers,
        uncertainties,
        summary: buildSummary(
          "Readiness",
          drivers,
          delta != null
            ? `appears ${delta >= 0 ? "higher" : "lower"} (${delta >= 0 ? "+" : ""}${delta} pts)`
            : `is ${r.label.toLowerCase()} (${r.score}/100)`,
        ),
      };
    }

    case "fatigue": {
      if (analytics.fatigue.formPct < -15) {
        drivers.push(
          driver({
            driver: "Accumulated training load (negative TSB)",
            impact: "large",
            confidence: "medium",
            evidence: [`TSB ${Math.round(analytics.fatigue.tsb)}`],
          }),
        );
      }
      if (analytics.intensityAdvice.hardRunsLast14d >= 3) {
        drivers.push(
          driver({
            driver: "Hard-session density",
            impact: "moderate",
            confidence: "medium",
            evidence: [`${analytics.intensityAdvice.hardRunsLast14d} hard runs in 14 days`],
          }),
        );
      }
      return {
        phenomenon: "Fatigue / freshness",
        likelyDrivers: drivers,
        uncertainties,
        summary: buildSummary(
          "Freshness",
          drivers,
          `appears ${analytics.fatigue.label.toLowerCase()} (${Math.round(analytics.fatigue.freshness)})`,
        ),
      };
    }

    case "efficiency": {
      const trend = analytics.efficiencySummary.trend;
      if (trend === "improving") {
        drivers.push(
          driver({
            driver: "Stable volume with polarized intensity",
            impact: "moderate",
            confidence: "low",
            evidence: [
              analytics.consistencyScore.label,
              `Easy ${Math.round(analytics.intensityAdvice.currentEasyPct)}%`,
            ],
          }),
        );
      } else if (trend === "declining") {
        drivers.push(
          driver({
            driver: "Fatigue masking aerobic signal",
            impact: "moderate",
            confidence: "low",
            evidence: [`TSB ${Math.round(analytics.fatigue.tsb)}`, analytics.fatigue.label],
          }),
        );
      }
      return {
        phenomenon: "Aerobic efficiency",
        likelyDrivers: drivers,
        uncertainties,
        summary:
          trend === "improving"
            ? "Efficiency appears to be improving, likely supported by consistent easy volume."
            : trend === "declining"
              ? "Efficiency appears under pressure: fatigue or intensity may be contributors."
              : "Efficiency signal is flat: insufficient trend to attribute causes.",
      };
    }

    case "forecast": {
      if (analytics.dataConfidence === "low") {
        drivers.push(
          driver({
            driver: "Limited race-specific training signal",
            impact: "moderate",
            confidence: "medium",
            evidence: ["Low overall data confidence for projections"],
          }),
        );
      }
      return {
        phenomenon: "Forecast confidence",
        likelyDrivers: drivers,
        uncertainties: ["Race-day conditions not modeled"],
        summary:
          drivers[0]?.driver ??
          "Forecast appears to reflect current fitness anchors and recent specificity.",
      };
    }

    default:
      return {
        phenomenon: phenomenon,
        likelyDrivers: drivers,
        uncertainties,
        summary: "Insufficient context to attribute drivers.",
      };
  }
}

function buildSummary(label: string, drivers: AttributedDriver[], statePhrase: string): string {
  if (drivers.length === 0) {
    return `${label} ${statePhrase}; no dominant driver identified from current evidence.`;
  }
  const top = drivers
    .slice(0, 2)
    .map((d) => d.driver.toLowerCase())
    .join(" and ");
  return `${label} ${statePhrase}, appears influenced primarily by ${top}.`;
}
