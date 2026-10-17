import type { ActivitySummary, Goal, RunActivity, StravaImport } from "@/lib/strava/types";

/**
 * Field-wise overlay: the overlay wins on every field it actually carries, and the
 * base is kept where the overlay has nothing to say.
 *
 * The two sources are not interchangeable. `lib/strava/api/mapActivity.ts` hard-codes
 * `trainingLoad`, `gradeAdjustedPaceSecPerKm`, `totalSteps` and `weatherTempC` to null
 * and never sets `fitFilename`, because the Strava API does not expose them; the CSV
 * export does. Replacing the whole record therefore *deleted* those fields on every
 * sync-after-import — silently, and on the documented Path A → Path B flow.
 *
 * `trainingLoad` is the costly one: `resolveLoadModel` picks the athlete's load source
 * by coverage, so losing it can switch the source and move CTL/ATL/TSB and
 * everything downstream of them.
 *
 * Trade-off, stated deliberately: if a source genuinely means "this value has been
 * cleared" it cannot express that through this merge, and the older value survives.
 * That is the right way round — the alternative deletes data that only one source
 * carries — and it matches how `profile` has always been merged below.
 */
function overlayFields<T extends object>(base: T, overlay: T): T {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay) as [keyof T, T[keyof T]][]) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Merge two imports. Runs and activities present in both are merged field-wise;
 * records unique to either side are kept.
 */
export function mergeStravaImports(
  base: StravaImport | null,
  overlay: StravaImport | null,
): StravaImport | null {
  if (!base) return overlay;
  if (!overlay) return base;

  const runsById = new Map<string, RunActivity>(base.runs.map((r) => [r.id, r]));
  for (const run of overlay.runs) {
    const existing = runsById.get(run.id);
    runsById.set(run.id, existing ? overlayFields(existing, run) : run);
  }

  const activitiesById = new Map<string, ActivitySummary>(base.allActivities.map((a) => [a.id, a]));
  for (const a of overlay.allActivities) {
    const existing = activitiesById.get(a.id);
    activitiesById.set(a.id, existing ? overlayFields(existing, a) : a);
  }

  const goalsKey = (g: Goal) =>
    `${g.type}|${g.activityType}|${g.target}|${g.startDate}|${g.timePeriod}`;
  const goalsByKey = new Map<string, Goal>();
  for (const g of [...base.goals, ...overlay.goals]) {
    goalsByKey.set(goalsKey(g), g);
  }

  const fitRunIds = Array.from(new Set([...(base.fitRunIds ?? []), ...(overlay.fitRunIds ?? [])]));

  const profile = {
    ...base.profile,
    maxHeartRate: overlay.profile.maxHeartRate ?? base.profile.maxHeartRate,
    athleteType: overlay.profile.athleteType ?? base.profile.athleteType,
    ftp: overlay.profile.ftp ?? base.profile.ftp,
    measurementPreference:
      overlay.profile.measurementPreference ?? base.profile.measurementPreference,
  };

  return {
    runs: Array.from(runsById.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
    profile,
    goals: Array.from(goalsByKey.values()),
    allActivities: Array.from(activitiesById.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
    importedAt:
      new Date(overlay.importedAt) > new Date(base.importedAt)
        ? overlay.importedAt
        : base.importedAt,
    exportLabel: mergeExportLabels(base.exportLabel, overlay.exportLabel),
    fitRunIds,
  };
}

function mergeExportLabels(a?: string, b?: string): string | undefined {
  if (!a?.trim()) return b?.trim() || undefined;
  if (!b?.trim()) return a.trim();
  const left = a.trim();
  const right = b.trim();
  if (left === right || left.includes(right) || right.includes(left)) {
    return left;
  }
  return `${left} + ${right}`;
}

export function enrichImportWithFitDetails(
  data: StravaImport,
  fitDetails: { activityId: string }[],
): StravaImport {
  const fitRunIds = Array.from(
    new Set([...(data.fitRunIds ?? []), ...fitDetails.map((f) => f.activityId)]),
  );
  return { ...data, fitRunIds };
}

export interface DataSources {
  localExport: boolean;
  stravaApi: boolean;
  /** Synthetic sample athlete loaded via "Try the demo". */
  demo?: boolean;
}

export function buildDataSourceLabel(sources: DataSources): string | null {
  if (sources.demo) return "Demo data";
  if (!sources.localExport && !sources.stravaApi) return null;
  if (sources.localExport && sources.stravaApi) return "Export + Strava API";
  if (sources.stravaApi) return "Strava API";
  return "Local export";
}
