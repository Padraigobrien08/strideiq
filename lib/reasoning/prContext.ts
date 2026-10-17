import { lastNDaysVolume } from "@/lib/analytics/volume";
import { weeklyLoadSeries, acuteChronicLoad } from "@/lib/analytics/fatigue";
import { confidenceFromRuns } from "@/lib/intelligence/envelope";
import { formatDuration, formatPace } from "@/lib/utils";
import { parseISO, subDays } from "date-fns";
import type { PersonalRecord } from "@/lib/analytics/records";
import type { PrContextArgs, ReasoningContext, ReasoningResult } from "./types";

const HARD = new Set(["tempo", "interval", "race"]);

function summarizeWindow(
  ctx: ReasoningContext,
  start: Date,
  end: Date,
): {
  fourWeekVolumeKm: number;
  hardSessions: number;
  longestRunKm: number;
  runCount: number;
  tsbAtEnd: number | null;
} {
  const inWindow = ctx.runs.filter((r) => {
    const d = parseISO(r.date);
    return d >= start && d <= end;
  });
  const daysSpan = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const vol = lastNDaysVolume(inWindow, Math.min(28, daysSpan));
  let hardSessions = 0;
  let longestRunKm = 0;
  for (const r of inWindow) {
    const type = ctx.labelByRunId.get(r.id)?.type ?? "unknown";
    if (HARD.has(type)) hardSessions++;
    longestRunKm = Math.max(longestRunKm, r.distanceM / 1000);
  }

  // Anchored at the window's end: unanchored, the series ran on to today and
  // `tsbAtEnd` described the athlete now rather than at the PR.
  const series = weeklyLoadSeries(inWindow, end);
  const load = series.length > 0 ? acuteChronicLoad(series) : null;

  return {
    fourWeekVolumeKm: Math.round(vol.distanceKm * 10) / 10,
    hardSessions,
    longestRunKm: Math.round(longestRunKm * 10) / 10,
    runCount: inWindow.length,
    tsbAtEnd: load?.tsb ?? null,
  };
}

function pickPr(ctx: ReasoningContext, args: PrContextArgs): PersonalRecord | null {
  const prs = ctx.analytics.personalRecords;
  if (args.runId) {
    return prs.find((p) => p.runId === args.runId) ?? null;
  }
  if (args.bucket) {
    return prs.find((p) => p.bucket === args.bucket) ?? null;
  }
  const hm = prs.find((p) => p.bucket === "hm");
  const tenK = prs.find((p) => p.bucket === "10k");
  return hm ?? tenK ?? prs[0] ?? null;
}

export function prContext(
  ctx: ReasoningContext,
  args: PrContextArgs = {},
): ReasoningResult<{
  pr: {
    label: string;
    runName: string;
    date: string;
    time: string;
    pace: string;
    distanceKm: number;
  } | null;
  prepWindow: ReturnType<typeof summarizeWindow>;
  priorWindow: ReturnType<typeof summarizeWindow>;
  changes: string[];
  narrative: string;
}> {
  const pr = pickPr(ctx, args);
  if (!pr) {
    return {
      payload: {
        pr: null,
        prepWindow: summarizeWindow(ctx, new Date(0), new Date()),
        priorWindow: summarizeWindow(ctx, new Date(0), new Date()),
        changes: [],
        narrative: "No personal record found for the requested distance.",
      },
      evidence: [],
      assumptions: [],
      limitations: ["Set bucket (5k, 10k, hm, long) or runId, or ensure PRs exist in data."],
      confidence: "low",
    };
  }

  const prDate = parseISO(pr.date);
  const prepStart = subDays(prDate, 56);
  const priorStart = subDays(prDate, 112);
  const priorEnd = subDays(prDate, 56);

  const prepWindow = summarizeWindow(ctx, prepStart, prDate);
  const priorWindow = summarizeWindow(ctx, priorStart, priorEnd);

  const changes: string[] = [];
  const volDelta = prepWindow.fourWeekVolumeKm - priorWindow.fourWeekVolumeKm;
  if (Math.abs(volDelta) >= 5) {
    changes.push(
      `4-week volume ${volDelta > 0 ? "up" : "down"} ~${Math.abs(volDelta).toFixed(0)} km before PR`,
    );
  }
  if (prepWindow.hardSessions !== priorWindow.hardSessions) {
    changes.push(
      `Hard sessions: ${priorWindow.hardSessions} → ${prepWindow.hardSessions} in 8 weeks before PR`,
    );
  }
  if (prepWindow.longestRunKm > priorWindow.longestRunKm + 1) {
    changes.push(
      `Longest run built to ${prepWindow.longestRunKm} km (was ${priorWindow.longestRunKm} km)`,
    );
  }
  if (
    prepWindow.tsbAtEnd != null &&
    priorWindow.tsbAtEnd != null &&
    prepWindow.tsbAtEnd > priorWindow.tsbAtEnd + 5
  ) {
    changes.push(`TSB fresher before PR (${prepWindow.tsbAtEnd} vs ${priorWindow.tsbAtEnd})`);
  }
  if (changes.length === 0) {
    changes.push("Training load pattern similar between the two 8-week windows.");
  }

  const narrative = `Before your ${pr.label} PR (${pr.runName}, ${pr.date.slice(0, 10)}): 8-week block had ${prepWindow.fourWeekVolumeKm} km rolling volume, ${prepWindow.hardSessions} hard sessions, longest ${prepWindow.longestRunKm} km. ${changes[0]}.`;

  return {
    payload: {
      pr: {
        label: pr.label,
        runName: pr.runName,
        date: pr.date.slice(0, 10),
        time: formatDuration(pr.timeSec),
        pace: formatPace(pr.paceSecPerKm),
        distanceKm: Math.round(pr.distanceKm * 10) / 10,
      },
      prepWindow,
      priorWindow,
      changes,
      narrative,
    },
    evidence: [
      `PR: ${pr.runName} ${formatDuration(pr.timeSec)} on ${pr.date.slice(0, 10)}`,
      `56d before PR: ${prepWindow.runCount} runs, ${prepWindow.fourWeekVolumeKm} km (4wk), TSB ~${prepWindow.tsbAtEnd ?? "n/a"}`,
      `Prior 56d: ${priorWindow.fourWeekVolumeKm} km (4wk), ${priorWindow.hardSessions} hard sessions`,
    ],
    assumptions: [
      "Prep window = 56 days before PR; prior window = 56 days before that.",
      "TSB approximated from runs in each window only.",
    ],
    limitations: [],
    confidence: confidenceFromRuns(ctx.runs.length),
  };
}
