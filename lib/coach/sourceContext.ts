/**
 * Where Coach was opened from, carried in the `/coach` URL.
 *
 * Phase 1 of the UI overhaul: the persistent Ask Coach action passes the source page
 * and, where there is one, the entity's id, so Coach can say what it was opened about
 * (ACCEPTANCE-TESTS NAV-03). Phase 5 extends this into the full `CoachSourceContext`
 * (docs/ui-overhaul/PHASE-0-AUDIT.md §6), which attaches threads and proposals to it.
 *
 * Only a kind and ids ever go in the URL — never athlete metrics, which would end up in
 * history, logs and referrers. Everything read back is validated against a fixed set,
 * so a crafted link cannot put arbitrary text on the Coach page.
 */

export type CoachSourceKind = "today" | "training_week" | "activity" | "progress";

export interface CoachSourceParams {
  source: CoachSourceKind;
  /** yyyy-MM-dd, for `today` and a selected `training_week` day. */
  date?: string;
  /** Strava activity id, for `activity`. */
  activity?: string;
  /** Saved-calendar workout id, for `today` when it follows the plan, or Training's selected day. */
  workout?: string;
}

const KINDS: ReadonlySet<string> = new Set<CoachSourceKind>([
  "today",
  "training_week",
  "activity",
  "progress",
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const WORKOUT_ID = /^[A-Za-z0-9_:.-]{1,96}$/;

export const SOURCE_LABELS: Record<CoachSourceKind, string> = {
  today: "Today",
  training_week: "Training week",
  activity: "Activity",
  progress: "Progress",
};

/**
 * The context the header's Ask Coach carries from a page, or null for general questions.
 * Page-level only: the header renders on the server too, where "today" can fall on a
 * different date than in the athlete's browser. Per-session links (Today's "Ask about
 * this run", Phase 2) add `date` themselves.
 */
export function coachSourceForPath(pathname: string): CoachSourceParams | null {
  if (pathname === "/home") return { source: "today" };
  const activity = pathname.match(/^\/runs\/([^/]+)(?:\/|$)/)?.[1];
  if (activity && ACTIVITY_ID.test(activity)) return { source: "activity", activity };
  if (pathname === "/training" || pathname.startsWith("/training/")) {
    return { source: "training_week" };
  }
  if (
    ["/progress", "/goals", "/performance", "/intelligence"].some(
      (r) => pathname === r || pathname.startsWith(`${r}/`),
    )
  ) {
    return { source: "progress" };
  }
  return null;
}

/** Read and validate the source params on the Coach page; anything unknown is dropped. */
export function parseCoachSource(params: {
  get(name: string): string | null;
}): CoachSourceParams | null {
  const source = params.get("source");
  if (!source || !KINDS.has(source)) return null;
  const kind = source as CoachSourceKind;
  const date = params.get("date");
  const activity = params.get("activity");
  const workout = params.get("workout");
  // A day and its session make sense from Today and from Training's selected day only.
  const dated = kind === "today" || kind === "training_week";
  return {
    source: kind,
    ...(dated && date && ISO_DATE.test(date) ? { date } : {}),
    ...(dated && workout && WORKOUT_ID.test(workout) ? { workout } : {}),
    ...(kind === "activity" && activity && ACTIVITY_ID.test(activity) ? { activity } : {}),
  };
}
