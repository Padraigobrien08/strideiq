import type { RunActivity } from "@/lib/strava/types";

export type RaceDistance = "5k" | "10k" | "hm" | "marathon";

export interface RaceGoal {
  distance: RaceDistance;
  date: string;
  targetTimeSec?: number;
  /** The athlete's name for the race, e.g. "Edinburgh Half Marathon" (≤ 60 chars). */
  name?: string;
}

export const RACE_NAME_MAX_LENGTH = 60;

/** What to call a race: its name when set, the distance otherwise. */
export function raceDisplayName(goal: Pick<RaceGoal, "distance" | "name">): string {
  const name = goal.name?.trim();
  return name ? name : RACE_DISTANCE_LABELS[goal.distance];
}

export const RACE_DISTANCE_LABELS: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  hm: "Half marathon",
  marathon: "Marathon",
};
import type { PersonalRecord } from "./records";
import type { RacePredictionAnalysis } from "./predictions";
import { lastNDaysVolume } from "./volume";
import { differenceInDays, parseISO } from "date-fns";

/**
 * A race goal is a *live* target only up to and including race day. Once the date is
 * in the past it becomes archived context, not an active race — callers should treat a
 * lapsed goal as "no active race" (this is what gates `raceReadiness` in the analytics build).
 */
export function isRaceUpcoming(goal: RaceGoal | null | undefined): boolean {
  if (!goal) return false;
  return differenceInDays(parseISO(goal.date), new Date()) >= 0;
}

const HM_KM = 21.0975;
const TYPICAL_4WK_HM_KM = 160;

/** Longest run as % of official race distance (not the shorter training long-run benchmark). */
export function longRunPercentOfRace(longestKm: number, raceDistanceKm: number): number {
  if (raceDistanceKm <= 0) return 0;
  return Math.round(Math.min(100, (longestKm / raceDistanceKm) * 100));
}

export function formatLongRunVsRace(longestKm: number, raceDistanceKm: number): string {
  const pct = longRunPercentOfRace(longestKm, raceDistanceKm);
  return `${longestKm.toFixed(1)} km (${pct}% of ${raceDistanceKm.toFixed(1)} km race)`;
}

export interface HalfMarathonReadiness {
  longestRunKm: number;
  longestRunPct: number;
  fourWeekVolumeKm: number;
  volumePct: number;
  score: number;
  label: string;
}

export interface ReadinessGap {
  metric: string;
  current: string;
  target: string;
}

export interface RaceReadiness {
  distance: RaceDistance;
  distanceLabel: string;
  daysUntilRace: number;
  raceDate: string;
  score: number;
  label: string;
  probabilityBand: string;
  longestRunKm: number;
  longestRunPct: number;
  fourWeekVolumeKm: number;
  volumePct: number;
  gaps: ReadinessGap[];
  targetTimeSec?: number;
}

export const RACE_READINESS_CONFIG: Record<
  RaceDistance,
  {
    label: string;
    raceDistanceKm: number;
    longRunTargetKm: number;
    fourWeekVolumeTargetKm: number;
    prBucket: string;
    consensusLabel: string;
  }
> = {
  "5k": {
    label: "5K",
    raceDistanceKm: 5,
    longRunTargetKm: 8,
    fourWeekVolumeTargetKm: 40,
    prBucket: "5k",
    consensusLabel: "5K",
  },
  "10k": {
    label: "10K",
    raceDistanceKm: 10,
    longRunTargetKm: 12,
    fourWeekVolumeTargetKm: 60,
    prBucket: "10k",
    consensusLabel: "10K",
  },
  hm: {
    label: "Half marathon",
    raceDistanceKm: HM_KM,
    longRunTargetKm: 18,
    fourWeekVolumeTargetKm: TYPICAL_4WK_HM_KM,
    prBucket: "hm",
    consensusLabel: "Half Marathon",
  },
  marathon: {
    label: "Marathon",
    raceDistanceKm: 42.195,
    longRunTargetKm: 32,
    fourWeekVolumeTargetKm: 220,
    prBucket: "long",
    consensusLabel: "Marathon",
  },
};

function readinessLabel(score: number): string {
  if (score >= 85) return "Race ready";
  if (score >= 65) return "Nearly there";
  if (score >= 40) return "In training";
  return "Building base";
}

function probabilityBand(score: number): string {
  if (score >= 85) return "Likely finish";
  if (score >= 65) return "On track";
  if (score >= 40) return "Building";
  return "Stretch goal";
}

function paceSignalPct(pr: PersonalRecord | undefined, predictedSec: number | undefined): number {
  if (!pr || !predictedSec || predictedSec <= 0) return 50;
  const ratio = pr.timeSec / predictedSec;
  if (ratio <= 1.05) return 100;
  if (ratio <= 1.12) return 80;
  if (ratio <= 1.2) return 60;
  return 35;
}

export function halfMarathonReadiness(runs: RunActivity[]): HalfMarathonReadiness {
  const longest = runs.reduce((m, r) => Math.max(m, r.distanceM), 0) / 1000;
  const fourWeek = lastNDaysVolume(runs, 28).distanceKm;
  const longestPct = Math.min(100, (longest / HM_KM) * 100);
  const volumePct = Math.min(100, (fourWeek / TYPICAL_4WK_HM_KM) * 100);
  const score = Math.round(longestPct * 0.6 + volumePct * 0.4);

  return {
    longestRunKm: longest,
    longestRunPct: Math.round(longestPct),
    fourWeekVolumeKm: Math.round(fourWeek * 10) / 10,
    volumePct: Math.round(volumePct),
    score,
    label: readinessLabel(score),
  };
}

export function raceReadiness(
  runs: RunActivity[],
  goal: RaceGoal,
  personalRecords: PersonalRecord[],
  predictionAnalysis: RacePredictionAnalysis,
): RaceReadiness {
  const config = RACE_READINESS_CONFIG[goal.distance];
  const longest = runs.reduce((m, r) => Math.max(m, r.distanceM), 0) / 1000;
  const fourWeek = lastNDaysVolume(runs, 28).distanceKm;

  const longestPct = longRunPercentOfRace(longest, config.raceDistanceKm);
  const volumePct = Math.min(100, (fourWeek / config.fourWeekVolumeTargetKm) * 100);

  const pr = personalRecords.find((p) => p.bucket === config.prBucket);
  const predictedSec = predictionAnalysis.consensus.find(
    (c) => c.label === config.consensusLabel,
  )?.timeSec;

  const pacePct = paceSignalPct(pr, predictedSec);

  const usePaceWeight = goal.distance === "5k" || goal.distance === "10k";
  const score = Math.round(
    usePaceWeight
      ? longestPct * 0.5 + volumePct * 0.35 + pacePct * 0.15
      : longestPct * 0.6 + volumePct * 0.4,
  );

  const raceDate = parseISO(goal.date);
  const daysUntilRace = Math.max(0, differenceInDays(raceDate, new Date()));

  const gaps: ReadinessGap[] = [];

  if (longest < config.raceDistanceKm * 0.92) {
    gaps.push({
      metric: "Long run",
      current: `${longest.toFixed(1)} km`,
      target: `${config.raceDistanceKm.toFixed(1)} km (race distance)`,
    });
  }

  if (fourWeek < config.fourWeekVolumeTargetKm) {
    gaps.push({
      metric: "4-week volume",
      current: `${fourWeek.toFixed(1)} km`,
      target: `~${config.fourWeekVolumeTargetKm} km`,
    });
  }

  if (usePaceWeight && pr && predictedSec) {
    const gapSec = pr.timeSec - predictedSec;
    if (gapSec > predictedSec * 0.12) {
      gaps.push({
        metric: "Race pace",
        current: formatTimeShort(pr.timeSec),
        target: formatTimeShort(predictedSec),
      });
    }
  }

  if (daysUntilRace <= 14 && score < 65) {
    gaps.push({
      metric: "Timeline",
      current: `${daysUntilRace} days left`,
      target: "Consider deferring or racing conservatively",
    });
  }

  return {
    distance: goal.distance,
    distanceLabel: config.label,
    daysUntilRace,
    raceDate: goal.date,
    score,
    label: readinessLabel(score),
    probabilityBand: probabilityBand(score),
    longestRunKm: Math.round(longest * 10) / 10,
    longestRunPct: Math.round(longestPct),
    fourWeekVolumeKm: Math.round(fourWeek * 10) / 10,
    volumePct: Math.round(volumePct),
    gaps,
    targetTimeSec: goal.targetTimeSec,
  };
}

function formatTimeShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
