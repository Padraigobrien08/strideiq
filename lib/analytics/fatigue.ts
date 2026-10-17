import type { RunActivity } from "@/lib/strava/types";
import type { LegFeel } from "@/lib/wellness/types";
import { DEFAULT_FEEL_CALIBRATION, type FeelCalibration } from "@/lib/wellness/calibration";
import { parseISO, format, subDays, differenceInCalendarDays } from "date-fns";
import { resolveLoadModel, type LoadModel, type LoadSource } from "./loadModel";

export interface WeeklyLoadPoint {
  /** First day (yyyy-MM-dd) of a seven-day window. Windows end on the anchor day, not on Sundays. */
  weekStart: string;
  label: string;
  load: number;
}

export interface AcuteChronicLoad {
  ctl: number;
  atl: number;
  tsb: number;
  /** TSB as a percentage of CTL. See `formPercent`. */
  formPct: number;
  history: { weekStart: string; label: string; ctl: number; atl: number }[];
}

export interface FatigueSnapshot {
  ctl: number;
  atl: number;
  /** Raw CTL − ATL, for display. Decisions read `formPct`, which does not depend on volume. */
  tsb: number;
  /** TSB as a percentage of CTL: how loaded the athlete is relative to their own norm. */
  formPct: number;
  freshness: number;
  /** Display string. May be Rusty / Detrained / Returning once currency applies. */
  label: string;
  /**
   * The two axes behind `freshness`, so callers can branch on meaning instead of
   * comparing the display string. `balance` is the load reading; `currency` is
   * whether that reading is still about the athlete.
   */
  readiness: {
    balance: "fatigued" | "neutral" | "fresh";
    currency: ReadinessCurrency;
    /** 28-day volume over the 12-week baseline; null when history is too sparse. */
    volumeRatio: number | null;
  };
  restDaysSinceLastRun: number;
  evidence: string[];
  usesProxyLoad: boolean;
  /**
   * Whether there is enough history for the load balance to mean anything. Decisions
   * (Today, the planner, plan safety, the forecast, outcome learning) must not act on
   * the balance when `sufficient` is false. See `assessLoadEvidence`.
   */
  loadEvidence: LoadEvidence;
  /** Which per-run load the model used — one source per athlete. See `lib/analytics/loadModel.ts`. */
  loadSource: LoadSource;
  /** The athlete's reported leg-feel for the day, if any — rides the snapshot to every consumer. */
  reportedLegFeel?: LegFeel;
}

/**
 * Load per seven-day window, oldest first, ending on `asOf`.
 *
 * Windows count back from the anchor day rather than following Monday–Sunday calendar
 * weeks. Calendar weeks made the model depend on the day it was read: the latest point
 * was a partial week (on a Monday, one day treated as seven — freshness 49 → 86
 * overnight on the demo athlete), and replacing it with a trailing seven days still
 * left it overlapping a calendar week that held a different set of runs. Measured on
 * the baseline fixtures, identical training read anywhere from 50 to 72 depending on
 * the weekday. Anchored windows are all whole, never overlap, and do not move with the
 * calendar, so the reading is the same whatever day it is.
 *
 * Windows with no runs are included as zero load, from the oldest run through `asOf`,
 * so a layoff decays CTL and ATL instead of being absent from the series.
 */
export function weeklyLoadSeries(
  runs: RunActivity[],
  asOf: Date = new Date(),
  model: LoadModel = resolveLoadModel(runs, asOf),
): WeeklyLoadPoint[] {
  if (runs.length === 0) return [];

  const loadByWindow = new Map<number, number>();
  let oldest = 0;
  for (const run of runs) {
    const days = differenceInCalendarDays(asOf, parseISO(run.date));
    // A run dated after the anchor (clock skew, a time-zone edge) counts as latest.
    const index = Math.max(0, Math.floor(days / 7));
    loadByWindow.set(index, (loadByWindow.get(index) ?? 0) + model.loadOf(run));
    oldest = Math.max(oldest, index);
  }

  const out: WeeklyLoadPoint[] = [];
  for (let index = oldest; index >= 0; index--) {
    const start = subDays(asOf, index * 7 + 6);
    out.push({
      weekStart: format(start, "yyyy-MM-dd"),
      label: format(start, "MMM d"),
      load: loadByWindow.get(index) ?? 0,
    });
  }
  return out;
}

/** Windows averaged to seed CTL and ATL. */
const SEED_WEEKS = 4;

export function acuteChronicLoad(
  series: WeeklyLoadPoint[],
  ctlTauWeeks = 6,
  // Was 1, which gives alpha = 2/(1+1) = 1.0: ATL became identically "this
  // week's load" with no memory, so acute load could never accumulate across
  // weeks. For a steady load the steady state is unchanged; this only damps the
  // transients it was supposed to be smoothing.
  atlTauWeeks = 2,
): AcuteChronicLoad {
  const alphaCtl = 2 / (ctlTauWeeks + 1);
  const alphaAtl = 2 / (atlTauWeeks + 1);
  // Seed both averages from the athlete's first weeks, not from zero. From zero, ATL
  // (fast) climbs to the athlete's real load long before CTL (slow) does, so every new
  // athlete read as deeply fatigued: TSB about -95 after one week and still about -30
  // after six, with Today prescribing recovery throughout. Seeded at the early mean,
  // steady training reads as balanced from the first week.
  const head = series.slice(0, SEED_WEEKS);
  const seed = head.length > 0 ? head.reduce((sum, w) => sum + w.load, 0) / head.length : 0;
  let ctl = seed;
  let atl = seed;
  const history: AcuteChronicLoad["history"] = [];

  for (const w of series) {
    ctl = alphaCtl * w.load + (1 - alphaCtl) * ctl;
    atl = alphaAtl * w.load + (1 - alphaAtl) * atl;
    history.push({
      weekStart: w.weekStart,
      label: w.label,
      ctl: Math.round(ctl),
      atl: Math.round(atl),
    });
  }

  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
    formPct: formPercent(ctl, atl),
    history,
  };
}

/**
 * Form: TSB as a percentage of CTL, clamped to ±100.
 *
 * Raw TSB is in load units, so every fixed threshold on it meant something different
 * for each athlete: ±10 was ±16% of the demo athlete's chronic load but ±2% for a
 * high-volume runner, and changed again with the load source. Expressed as a share of
 * the athlete's own chronic load, the same state reads the same way at any volume.
 *
 * Thresholds that used to read raw TSB were converted with one mapping, taken from the
 * old Neutral band's edges (−10 → −15 %, +10 → +10 %): `form = 1.25 × tsb − 2.5`. That
 * keeps every rule in the same order relative to the others; signs are unchanged.
 */
export function formPercent(ctl: number, atl: number): number {
  if (ctl <= 0) return 0;
  const pct = ((ctl - atl) / ctl) * 100;
  return Math.round(Math.max(-100, Math.min(100, pct)) * 10) / 10;
}

/** The old raw-TSB value a form percentage corresponds to — the inverse of the mapping above. */
const legacyTsb = (formPct: number) => (formPct + 2.5) / 1.25;

/**
 * Freshness (0–100) and its label from form. The bands are the old raw-TSB bands carried
 * through the documented mapping, so the 0–100 scale — which dozens of downstream
 * thresholds read — keeps its shape: Fresh above +10 %, Fatigued below −15 %.
 */
export function freshnessFromForm(
  formPct: number,
  restDaysSinceLastRun: number,
  legFeel?: LegFeel,
  calibration: FeelCalibration = DEFAULT_FEEL_CALIBRATION,
): { freshness: number; label: string } {
  // The original raw-TSB bands, read on the legacy-equivalent value.
  const legacy = legacyTsb(formPct);
  let freshness: number;
  let label: string;

  if (legacy > 10) {
    freshness = Math.min(100, 75 + Math.min(25, legacy));
    label = "Fresh";
  } else if (legacy >= -10) {
    freshness = 40 + Math.round(((legacy + 10) / 20) * 34);
    label = "Neutral";
  } else {
    freshness = Math.max(0, 39 + Math.round(legacy));
    label = "Fatigued";
  }

  if (restDaysSinceLastRun >= 2 && label === "Fatigued") {
    freshness = Math.min(100, freshness + 10);
  } else if (restDaysSinceLastRun >= 2 && label === "Neutral") {
    freshness = Math.min(100, freshness + 5);
  }

  // Subjective nudge: bounded, asymmetric, safety-first. Adjusts the day's
  // readiness only — never the CTL/ATL/TSB fitness model. "Heavy" is respected
  // more than "fresh" is rewarded, so it can force a back-off but never unlock a
  // hard day the load balance didn't already sanction.
  if (legFeel === "heavy") {
    freshness = Math.max(0, freshness + calibration.heavyDelta);
    if (label === "Fresh") label = "Neutral";
    if (freshness < 40) label = "Fatigued";
  } else if (legFeel === "fresh") {
    freshness = Math.min(100, freshness + calibration.freshDelta);
  }

  return { freshness: Math.round(freshness), label };
}

/* ------------------------- currency (axis B) ------------------------------ */

/**
 * How current the training is, which is a different question from how loaded
 * the athlete is. Balance alone said "Fresh, freshness 100" to someone who had
 * not run in 11 days, because rest only ever added freshness and TSB has no
 * upper turn. Currency is driven by directly observable facts rather than TSB,
 * which a form ratio could not do: with sporadic training CTL is small, so any
 * positive TSB inflates the ratio and flags real training days as stale.
 *
 * See docs/proposals/readiness-model.md.
 */
export type ReadinessCurrency = "current" | "light-gap" | "rusty" | "detrained" | "returning";

const CURRENCY_CAP: Record<ReadinessCurrency, number> = {
  current: 100,
  "light-gap": 85,
  rusty: 65,
  detrained: 50,
  returning: 40,
};

/** Currency states that must never read as fresh, whatever the load balance says. */
const STALE: ReadinessCurrency[] = ["rusty", "detrained", "returning"];

const CURRENCY_LABEL: Partial<Record<ReadinessCurrency, string>> = {
  rusty: "Rusty",
  detrained: "Detrained",
  returning: "Returning",
};

/**
 * @param restDays days since the last run
 * @param volumeRatio 28-day volume as a fraction of the athlete's 12-week median,
 *   or null when there is not enough history to have a baseline
 */
export function classifyCurrency(restDays: number, volumeRatio: number | null): ReadinessCurrency {
  if (restDays > 28) return "returning";
  if (restDays >= 15) return "detrained";
  if (restDays >= 8) return "rusty";
  // A token run every few days should not mask training having collapsed, so a
  // recent run still reads as rusty when 28-day volume is far below baseline.
  if (volumeRatio != null && volumeRatio < 0.4) return "rusty";
  if (restDays >= 4) return "light-gap";
  return "current";
}

/** 28-day volume over the 12-week median of 28-day volumes; null when too sparse. */
export function volumeCurrencyRatio(runs: RunActivity[], now = new Date()): number | null {
  if (runs.length < 6) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const kmIn = (fromDaysAgo: number, toDaysAgo: number) =>
    runs
      .filter((r) => {
        const age = (now.getTime() - parseISO(r.date).getTime()) / dayMs;
        return age >= toDaysAgo && age < fromDaysAgo;
      })
      .reduce((s, r) => s + r.distanceM / 1000, 0);

  const recent = kmIn(28, 0);
  // Three earlier 28-day windows form the baseline; median resists one odd block.
  const priors = [kmIn(56, 28), kmIn(84, 56)].filter((v) => v > 0);
  if (priors.length === 0) return null;
  const baseline = priors.sort((a, b) => a - b)[Math.floor(priors.length / 2)];
  if (baseline <= 0) return null;
  return recent / baseline;
}

/**
 * Apply currency on top of a balance result: cap the number, and rename the
 * label when the data is too stale for the balance reading to mean anything.
 */
export function applyCurrency(
  balance: { freshness: number; label: string },
  currency: ReadinessCurrency,
): { freshness: number; label: string } {
  const freshness = Math.min(balance.freshness, CURRENCY_CAP[currency]);
  const label = STALE.includes(currency) ? CURRENCY_LABEL[currency]! : balance.label;
  return { freshness, label };
}

export interface LoadEvidence {
  sufficient: boolean;
  /** Low when insufficient or intensity-blind (distance only); high after twelve weeks. */
  confidence: "low" | "medium" | "high";
  /** Calendar days from the first run to today. */
  historyDays: number;
  runCount: number;
  /** Plain-language reasons the reading is limited; empty when nothing limits it. */
  reasons: string[];
}

/** Four weeks: what the seeded averages need before a deviation means something. */
export const MIN_LOAD_HISTORY_DAYS = 28;
/** A long span with a handful of runs is still no basis for a balance. */
export const MIN_LOAD_RUNS = 4;

/**
 * Is there enough history for the balance to be evidence?
 *
 * Seeding (see `acuteChronicLoad`) removed the systematic "new athletes look
 * fatigued" bias, but with under four weeks of runs the averages still rest on a
 * week or two of load, and one long run swings the reading. Those athletes get
 * "not enough evidence": decisions fall back to schedule and intensity rules rather
 * than treating the number as a finding.
 */
export function assessLoadEvidence(
  runs: RunActivity[],
  model: LoadModel,
  asOf: Date = new Date(),
): LoadEvidence {
  const runCount = runs.length;
  const earliest = runs.reduce<string | null>(
    (min, r) => (min === null || r.date < min ? r.date : min),
    null,
  );
  const historyDays = earliest
    ? Math.max(0, differenceInCalendarDays(asOf, parseISO(earliest)))
    : 0;

  const reasons: string[] = [];
  if (historyDays < MIN_LOAD_HISTORY_DAYS) {
    reasons.push(
      `Only ${historyDays} days of training history; the load balance needs ${MIN_LOAD_HISTORY_DAYS} to settle.`,
    );
  }
  if (runCount < MIN_LOAD_RUNS) {
    reasons.push(`Only ${runCount} runs; the load balance needs at least ${MIN_LOAD_RUNS}.`);
  }
  const sufficient = reasons.length === 0;
  if (model.source === "distance") {
    reasons.push("Load from distance only: session intensity is not counted.");
  }

  const confidence =
    !sufficient || model.source === "distance" ? "low" : historyDays < 84 ? "medium" : "high";
  return { sufficient, confidence, historyDays, runCount, reasons };
}

const LOAD_SOURCE_EVIDENCE: Record<LoadSource, string> = {
  relative_effort: "Load from Strava Relative Effort, scaled to a distance-equivalent unit.",
  training_load: "Load from Strava Training Load, scaled to a distance-equivalent unit.",
  distance: "Load estimated from distance (no effort score on most recent runs).",
};

export function buildFatigueSnapshot(
  runs: RunActivity[],
  legFeel?: LegFeel,
  calibration: FeelCalibration = DEFAULT_FEEL_CALIBRATION,
): FatigueSnapshot {
  const model = resolveLoadModel(runs);
  const loadEvidence = assessLoadEvidence(runs, model);
  const series = weeklyLoadSeries(runs, new Date(), model);
  const usesProxyLoad = model.source === "distance";

  const { ctl, atl, tsb, formPct, history } = acuteChronicLoad(series);
  const sorted = [...runs].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  const lastRun = sorted[0];
  const restDaysSinceLastRun = lastRun
    ? Math.floor((Date.now() - parseISO(lastRun.date).getTime()) / (1000 * 60 * 60 * 24))
    : 99;

  const balance = freshnessFromForm(formPct, restDaysSinceLastRun, legFeel, calibration);
  const volumeRatio = volumeCurrencyRatio(runs);
  const currency = classifyCurrency(restDaysSinceLastRun, volumeRatio);
  const { freshness, label } = applyCurrency(balance, currency);

  const evidence = [
    `Chronic load (CTL): ${ctl} · Acute load (ATL): ${atl} · Balance (TSB): ${tsb > 0 ? "+" : ""}${tsb} (${formPct > 0 ? "+" : ""}${Math.round(formPct)}% of CTL).`,
    `Rest days since last run: ${restDaysSinceLastRun}.`,
    LOAD_SOURCE_EVIDENCE[model.source],
    ...(loadEvidence.sufficient ? [] : loadEvidence.reasons.slice(0, 1)),
  ];

  if (history.length >= 2) {
    const prev = history.at(-2);
    if (prev && atl > prev.atl) {
      evidence.push("Acute load has risen recently: prioritize recovery if adding intensity.");
    }
  }

  if (legFeel === "heavy") {
    evidence.push("Adjusted down for reported heavy legs: protect the block today.");
  } else if (legFeel === "fresh") {
    evidence.push("Nudged up for reported fresh legs.");
  }
  if (
    legFeel &&
    legFeel !== "normal" &&
    calibration.reliability > 0.5 &&
    calibration.sampleCount >= 4
  ) {
    evidence.push(calibration.basis);
  }

  return {
    ctl,
    atl,
    tsb,
    formPct,
    freshness,
    label,
    readiness: {
      balance:
        balance.label === "Fresh" ? "fresh" : balance.label === "Fatigued" ? "fatigued" : "neutral",
      currency,
      volumeRatio,
    },
    restDaysSinceLastRun,
    evidence,
    usesProxyLoad,
    loadEvidence,
    loadSource: model.source,
    reportedLegFeel: legFeel,
  };
}
