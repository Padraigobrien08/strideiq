import { formatDuration } from "@/lib/utils";
import type { CoachingContext, RecentTrainingWeek, RunCoachDetail } from "./types";

const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_CHARS = 28_000;

export interface SerializeOptions {
  maxChars?: number;
}

function formatSec(sec?: number): string {
  if (sec == null || sec <= 0) return "—";
  return formatDuration(sec);
}

function weekLine(w: RecentTrainingWeek): string {
  return (
    `${w.weekLabel}: ${w.runCount} runs, ${w.runDistanceKm} km` +
    ` (long ${w.longRunDistanceKm} km, ${w.hardRunCount} hard)` +
    ` · ${w.totalTrainingMinutes} min total` +
    (w.crossTrainingMinutes > 0 ? ` · ${w.crossTrainingMinutes} min non-run` : "") +
    (w.strengthSessions > 0 ? ` · ${w.strengthSessions} strength` : "") +
    (w.restDaysEstimate > 0 ? ` · ~${w.restDaysEstimate} rest days` : "")
  );
}

function section(title: string, body: string[]): string {
  const content = body.filter((l) => l.trim().length > 0);
  if (content.length === 0) return "";
  return `## ${title}\n${content.join("\n")}\n`;
}

function formatRunCoachDetail(d: RunCoachDetail): string {
  const head =
    `**${d.date}, ${d.name}** (${d.workoutTypeLabel}, ${d.distanceKm} km, ${d.durationMin} min` +
    (d.pace ? `, ${d.pace}/km` : "") +
    `)`;
  const vitals = [
    d.avgHr != null ? `avg HR ${d.avgHr}` : null,
    d.maxHr != null ? `max ${d.maxHr}` : null,
    d.elevationGainM != null ? `+${Math.round(d.elevationGainM)} m` : null,
    d.trainingLoad != null ? `load ${d.trainingLoad}` : null,
    d.gradeAdjustedPace ? `GAP ${d.gradeAdjustedPace}/km` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const exec = `Execution: ${d.executionQuality} (${d.executionScore}/100) · fatigue ${d.fatigueCost} · goal fit ${d.goalAlignment}`;
  const streams = `Data: ${d.streams}`;
  const metrics = [
    d.hrDriftPct != null ? `HR drift +${d.hrDriftPct}%` : null,
    d.lateFadePct != null ? `late fade +${d.lateFadePct.toFixed(1)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    head,
    vitals ? `Vitals: ${vitals}` : "",
    exec,
    streams,
    metrics ? `Stream metrics: ${metrics}` : "",
    `Pacing: ${d.pacingAssessment}`,
    d.hrAssessment ? `HR: ${d.hrAssessment}` : "",
    d.historicalComparison ? `Vs history: ${d.historicalComparison}` : "",
    d.lapSummary ? `Laps: ${d.lapSummary}` : "",
    d.likelyAdaptations.length ? `Adaptation: ${d.likelyAdaptations.join("; ")}` : "",
    d.narrative,
    d.evidence.length ? `Evidence: ${d.evidence.join("; ")}` : "",
    `runId: ${d.runId}`,
  ];
  return lines.filter((l) => l.trim().length > 0).join("\n");
}

/**
 * Deterministic, sectioned text for LLM system/context injection.
 * Omits raw activity arrays by default; caps size for ~8k token budget.
 */
export function serializeCoachingContextForLLM(
  context: CoachingContext,
  opts?: SerializeOptions,
): string {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const lines: string[] = [];

  lines.push(
    section("Athlete profile", [
      `Archetype: ${context.athlete.archetype}`,
      context.athlete.profileSummary,
      context.athlete.knownPatterns.length > 0
        ? "Known patterns:\n" +
          context.athlete.knownPatterns
            .map((p) => `- ${p.label}: ${p.summary} (${p.confidence})`)
            .join("\n")
        : "",
    ]),
  );

  if (context.goal) {
    const g = context.goal;
    lines.push(
      section("Goal", [
        `${g.raceType} (${(g.distanceMeters / 1000).toFixed(1)} km)`,
        g.raceDate ? `Race date: ${g.raceDate}` : "",
        g.daysUntilRace != null ? `Days until race: ${g.daysUntilRace}` : "",
        g.targetTimeSec ? `Target: ${formatSec(g.targetTimeSec)}` : "",
        `Priority: ${g.priority}`,
      ]),
    );
  }

  const s = context.currentState;
  lines.push(
    section("Current state", [
      s.stateSummary,
      `Primary focus: ${s.primaryFocus}`,
      `Fatigue: ${s.fatigueState} · Durability: ${s.durability} · Specificity: ${s.specificity} · Intensity balance: ${s.intensityBalance}`,
      s.readiness != null ? `Readiness score: ${s.readiness}` : "",
      `Training load balance: ${s.trainingLoadBalance.reading}`,
      s.reportedLegFeel ? `Reported legs today: ${s.reportedLegFeel}` : "",
    ]),
  );

  const rt = context.recentTraining;
  lines.push(
    section("Recent training", [
      rt.summary,
      `Window: ${rt.windowDays} days`,
      rt.keyChanges.length ? "Key changes:\n" + rt.keyChanges.map((c) => `- ${c}`).join("\n") : "",
      "Weekly rollup:",
      ...rt.weeks.map(weekLine),
      rt.notableSessions.length
        ? "Notable sessions:\n" +
          rt.notableSessions
            .map(
              (n) =>
                `- ${n.date} ${n.label}` +
                (n.distanceKm != null ? ` ${n.distanceKm} km` : "") +
                (n.durationMin != null ? ` ${n.durationMin} min` : "") +
                `, ${n.note}`,
            )
            .join("\n")
        : "",
    ]),
  );

  if (context.recentSessionDetails.length > 0) {
    lines.push(
      section("Recent run details", [
        "Per-run execution, HR, pacing, and lap detail (use get_run_detail for a single run deep dive):",
        ...context.recentSessionDetails.map(formatRunCoachDetail),
      ]),
    );
  }

  if (context.forecast) {
    const f = context.forecast;
    lines.push(
      section("Forecast", [
        f.mostLikelyTimeSec ? `Most likely: ${formatSec(f.mostLikelyTimeSec)}` : "",
        f.realisticRangeSec
          ? `Range: ${formatSec(f.realisticRangeSec.low)}–${formatSec(f.realisticRangeSec.high)}`
          : "",
        `Confidence: ${f.confidence}`,
        f.positiveContributors.length
          ? "Supports:\n" + f.positiveContributors.map((c) => `- ${c}`).join("\n")
          : "",
        f.negativeContributors.length
          ? "Limits:\n" + f.negativeContributors.map((c) => `- ${c}`).join("\n")
          : "",
        f.uncertaintyDrivers.length
          ? "Uncertainty:\n" + f.uncertaintyDrivers.map((c) => `- ${c}`).join("\n")
          : "",
        f.recommendation ? `Recommendation: ${f.recommendation}` : "",
      ]),
    );
  }

  if (context.modalityContext.crossTrainingSummary !== "Modality context omitted.") {
    const m = context.modalityContext;
    lines.push(
      section("Modality & cross-training", [
        m.crossTrainingSummary,
        m.strengthSummary,
        m.mobilitySummary,
        m.interferenceRisks.length
          ? "Interference risks:\n" + m.interferenceRisks.map((r) => `- ${r}`).join("\n")
          : "",
      ]),
    );
  }

  if (context.risks.length) {
    lines.push(section("Risks", context.risks.map(formatRisk)));
  }

  if (context.opportunities.length) {
    lines.push(
      section(
        "Opportunities",
        context.opportunities.map(
          (o) => `- ${o.label} (${o.confidence})\n  Evidence: ${o.evidence.join("; ")}`,
        ),
      ),
    );
  }

  const c = context.constraints;
  lines.push(
    section("Constraints", [
      c.maxWeeklyVolumeKm != null ? `Max weekly volume: ${c.maxWeeklyVolumeKm} km` : "",
      c.maxHardSessions != null ? `Max hard sessions: ${c.maxHardSessions}` : "",
      c.raceWeek ? "Race week: yes" : "",
      c.tapering ? "Tapering: yes" : "",
      c.avoidIntensityStacking ? "Avoid intensity stacking on adjacent days" : "",
      c.notes.length ? c.notes.map((n) => `- ${n}`).join("\n") : "",
    ]),
  );

  const dq = context.dataQuality;
  lines.push(
    section("Data limitations", [
      `Activities: ${dq.activityCount} · HR coverage: ${dq.hrCoverage} · Stream coverage: ${dq.streamCoverage}`,
      dq.confidenceLimitations.length
        ? dq.confidenceLimitations.map((l) => `- ${l}`).join("\n")
        : "No major limitations flagged.",
      `Context generated: ${context.generatedAt}`,
    ]),
  );

  let out = lines.filter(Boolean).join("\n").trim();
  if (out.length > maxChars) {
    out =
      out.slice(0, maxChars - 80) +
      "\n\n[Context truncated for token budget, use tools for detail.]";
  }
  return out;
}

function formatRisk(r: CoachingContext["risks"][0]): string {
  return `- ${r.label} [${r.severity}, ${r.confidence}]\n` + `  Evidence: ${r.evidence.join("; ")}`;
}

export function estimateCoachingContextTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}
