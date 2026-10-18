# Phase 0 — baseline and contract audit

Audit of `main` @ `4aa3f4d` (2026-10-18) against [SPEC.md](./SPEC.md), [DECISIONS.md](./DECISIONS.md),
[IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) and [ACCEPTANCE-TESTS.md](./ACCEPTANCE-TESTS.md), following the
audit prompt in [CLAUDE-HANDOFF.md](./CLAUDE-HANDOFF.md). No application code was changed.

Phase numbers below are IMPLEMENTATION-PLAN's (1 shell, 2 Today, 3 Training, 4 Progress, 5 Coach,
6 states/a11y). SPEC §15 numbers them differently — its "Phase 1 — Structure" also recomposes Today.

## 1. Baseline

| Check           | Result                                                                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` | **Fails locally, environment only.** Prettier scans `.claude/worktrees/wonderful-dirac-e0c262/` (a finished session's worktree inside the repo) and flags its generated contract files. Prettier on the repository's own files passes. CI is unaffected. |
| `tsc --noEmit`  | Pass                                                                                                                                                                                                                                                     |
| ESLint          | 0 errors, 23 pre-existing warnings (React Compiler hints)                                                                                                                                                                                                |
| `vitest run`    | 1,987 passed, 36 skipped, 0 failed                                                                                                                                                                                                                       |
| `npm run build` | Pass                                                                                                                                                                                                                                                     |

Any later failure other than the worktree Prettier warning is an overhaul regression. (Fix for the
warning: add `.claude/` to `.prettierignore`, matching ESLint and Vitest, which already ignore it.)

## 2. What each phase can reuse

| Phase          | Retain                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Shell        | `components/workspace/shell.tsx` (`AppWorkspaceShell`, `WorkspaceFrame`, coach-route viewport lock), `components/nav.tsx` (rewrite the link table), `components/command-palette.tsx` (keeps every compatibility route), `lib/coach/domainLinks.ts` (`coachUrl`, `topicCoachLink`), theme toggle, `WorkspaceMeta` (demo / source / clear). |
| 2 Today        | `useTrainingIntelligence`, `useTrainingCalendar` (saved week), `lib/home/operatingSystemView.ts` data assembly, **`recommendTodaySession`** (kind, distance range, intensity, rationale — not used by Today today), `todayLoadImpact` (readiness exception, SPEC §6.7), `isRaceUpcoming`, `RequireData`, demo flow.                       |
| 3 Training     | `lib/training-calendar/*` (storage, revisions, `calendarHistory` snapshots/undo, validation, `swapWorkoutDays`), `matchPlannedVsActual`, `components/plan/*` (week board, mobile swiper, execution, generation/preview/replace), `hooks/use-weekly-plan.ts`, `components/runs/*`, `components/run-detail/*`.                              |
| 4 Progress     | `lib/forecasting-v2` (`buildRaceForecastV2`: band, confidence, model estimates, component scores), `lib/goals/forecastV2ViewModel.ts`, `lib/goals/viewModels.ts`, `goalScenarios`, forecast log + calibration (`lib/db/forecast-log.ts`, `useForecastAccuracy`), `components/goals/*`, `components/intelligence/*` as the deeper surface. |
| 5 Coach        | `components/coach/*`, `useCoachThread`, `threadStorage`, `activeIntelligence`, `trainingLoadBalance` payload (phase 3a), `generate_next_week_training_plan` → `GenerateWeeklyPlanResult` (validated, display-only in Coach today), calendar validation.                                                                                   |
| 6 States, a11y | `components/ui/*` primitives, `DashboardSkeleton`, `jargon-term.tsx`, existing error boundaries (`app/error.tsx`, `global-error.tsx`).                                                                                                                                                                                                    |

## 3. Conflicts between the spec and current contracts

1. **Today does not use the prescription engine.** `buildTodayFocus` shows the saved week's
   `title`/`purpose`, and without a saved week infers a title from prose. SPEC §6.3 needs session
   type, distance, duration and pace as structured values. _Resolution (no contract change):_ planned
   day → `CalendarWorkout` fields; no plan → `recommendTodaySession` (kind, km range, intensity,
   rationale).
2. **No target pace anywhere in the plan contract.** `CalendarWorkout` has `durationMin?`,
   `distanceKm?` and `intensity`, but no pace; Today, Training's selected day and proposals all
   require one. Physiology computes threshold pace and critical speed, but nothing maps an intensity
   to a pace range. **Decision needed** — see §7, D2.
3. **No workout structure.** SPEC §7.4/§9.5 ("workout structure", "selected structure fields") have
   no field to read or edit. **Decision needed** — D3.
4. **Projection history uses the wrong model.** The browser's `predictionTimeline` is the legacy
   consensus model (point estimates, no range, no confidence — the one `projectionHonesty` notes
   backtests at +29 % vs +7.5 % for forecast v2). Real v2 history with bands exists only in the
   server forecast log, for connected athletes, from when logging began. SPEC §8.6 needs a range over
   time. **Decision needed** — D4.
5. **`/training` already means something else.** Today it is the load-analytics dashboard ("Am I
   training correctly?"); the current week lives on `/plan`. DECISIONS makes `/training` the week, but
   that content moves only in Phase 3, and `/progress` does not exist until Phase 4. Phase 1's
   navigation needs interim targets — D1.
6. **The visual system has no phase.** SPEC §5 (warm off-white base, charcoal, muted orange, sage,
   Geist-class type) is listed under "Styling" in the repo map but no phase owns it. The app defaults
   to a dark theme (`#09090b`, orange `#f0864a`) with a light alternative (`#f4f4f5`, `#d95d24`).
   **Decision needed** — D5.
7. **Race goals have no name.** `RaceGoal` is `{ distance, date, targetTimeSec? }`; SPEC §6.4 shows a
   race name. Use the distance label ("Half marathon") unless a `name` field is added — D6.
8. **Coach threads are anonymous.** `CoachThread` is `{ id, title, updatedAt, messages }`, and
   `coachUrl` carries only `domain`, `q`, `investigate`. Contextual history (SPEC §9.3) and source
   context need the contract in §6.

No conflict with the analytics contracts: statuses, ranges and confidence can all come from
deterministic code, and nothing in the spec requires the LLM to compute a number.

## 4. Can every required state come from real data?

| State                                              | Today                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today: planned run (type, km, duration)            | Yes, from the saved week. Pace: no (§3.2).                                                                                                           |
| Today: no plan                                     | Yes, via `recommendTodaySession` (currently unused by Today).                                                                                        |
| Today: rest day + tomorrow preview                 | Yes (`modality: "rest"`, next day in the saved week). Mobility/sleep/fuel guidance is static content.                                                |
| Today: readiness exception                         | Yes — `todayLoadImpact` (load-balance phase 3a).                                                                                                     |
| Today: race outlook / no race                      | Yes (race readiness, forecast; fitness trajectory and insights for no race). Race name: no (§3.7).                                                   |
| Training: 7 statuses                               | Yes — `matchPlannedVsActual` + calendar status map onto all seven (`partial` → "with variance", `modified` → "Changed").                             |
| Training: planned vs actual distance/duration/pace | Distance, duration, actual pace: yes. Planned pace: no (§3.2).                                                                                       |
| Progress: Ahead / On track / At risk               | Yes, derivable: goal time against the v2 band and confidence. No mapping exists yet (new view model).                                                |
| Progress: Not enough evidence                      | Yes — forecast confidence, import quality, `loadEvidence`.                                                                                           |
| Progress: projection over time with range          | Partially — server log only (§3.4).                                                                                                                  |
| Progress: evidence with source/date/direction      | Mostly — v2 model estimates and component scores; per-input dates need the input runs' dates attached.                                               |
| Coach: source context, contextual history          | No — new contract (§6).                                                                                                                              |
| Coach: structured proposal, stale detection        | Partially — `GenerateWeeklyPlanResult` is validated data and `TrainingCalendarWeek.revision` supports staleness; the proposal/diff type is new (§6). |

## 5. Route migration

| Route                 | Today                                                               | Phase 1                                                | Final                                                    |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `/home`               | Console dashboard                                                   | Nav "Today"                                            | Today (Phase 2)                                          |
| `/plan`               | Current-week workspace (12 inbound files)                           | Nav "Training" target (D1)                             | Redirects to `/training` once Phase 3 lands              |
| `/training`           | Load-analytics dashboard (3 inbound files)                          | Unchanged, under Training                              | Current week; analytics move to Progress depth (Phase 3) |
| `/progress`           | —                                                                   | Created; interim content (D1)                          | Progress overview (Phase 4)                              |
| `/runs`, `/runs/[id]` | Activity log and detail (11 inbound files)                          | Under Training; one visible entry from the week        | Training drill-ins                                       |
| `/goals`              | Already a redirect to `/plan?tab=goal` (Goals was merged into Plan) | Unchanged; `/progress` renders the same Race goal view | Redirect to `/progress` once Phase 4 lands               |
| `/performance`        | Performance analytics (4 inbound files)                             | Unchanged                                              | Progress depth; redirect only once consolidated          |
| `/intelligence`       | Belief model (3 inbound files)                                      | Off the top nav; linked from Progress                  | Deeper read-first surface behind Progress                |
| `/coach`              | Coach (3 files + 29 `coachUrl` call sites)                          | Ask Coach action, not a nav destination                | Contextual Coach (Phase 5)                               |
| `/report`, `/context` | Palette-only depth                                                  | Unchanged (palette)                                    | Unchanged                                                |

No route is deleted or mass-redirected before its replacement passes acceptance tests (DECISIONS).

## 6. Typed contracts for contextual Coach and proposals

```ts
/** What Coach was opened about. URLs carry only `kind` and ids — never athlete metrics. */
type CoachSourceContext =
  | { kind: "today"; date: string; calendarWorkoutId?: string }
  | { kind: "training_week"; weekStart: string; weekRevision: number; selectedDate?: string }
  | { kind: "activity"; activityId: string; date: string; plannedWorkoutId?: string }
  | { kind: "progress"; distanceKey: string; assessedAt: string }
  | { kind: "general" };

/** Stable key so reopening an entity recovers its conversation (COACH-02). */
type CoachContextKey = string; // "today:2026-10-18" | "week:2026-10-12" | "activity:<id>" | "progress:hm" | "general"

interface CoachThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: CoachMessage[];
  /** Absent on threads saved before Phase 5; read as `{ kind: "general" }`. */
  context?: CoachSourceContext;
  contextKey?: CoachContextKey;
}

interface PlanProposal {
  id: string;
  threadId: string;
  source: CoachSourceContext;
  weekStart: string;
  /** `TrainingCalendarWeek.revision` the proposal was built against; a mismatch marks it stale. */
  baseRevision: number;
  changes: ProposedSessionChange[];
  totals: { before: WeekTotals; after: WeekTotals }; // recomputed after every edit
  raceImpact: string; // deterministic summary, not LLM prose
  reason: string; // Coach's rationale, display only
  validation: CalendarValidationResult; // re-run after every edit
  status: "draft" | "stale" | "invalid" | "applied" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

interface ProposedSessionChange {
  workoutId: string | null; // null = added session
  before: CalendarWorkout | null; // null = added
  after: CalendarWorkout | null; // null = removed
  changedFields: (keyof CalendarWorkout)[];
}

interface WeekTotals {
  runDistanceKm: number;
  durationMin: number | null;
  hardSessionCount: number;
}
```

"Update plan" is the only writer: it checks `baseRevision`, re-validates, calls
`pushWeekSnapshot`, then `saveCalendarWeek` once. "Keep current plan" sets `dismissed` and writes
nothing to the calendar.

## 7. Decisions

Reviewed 2026-10-18. D3 and D4 are recommendations still to confirm before Phases 3 and 4.

| #   | Decision                       | Outcome                                                                                                                                                                                                                                                             |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Interim nav targets in Phase 1 | **Approved.** "Training" → `/plan` (active on `/plan`, `/training`, `/runs`); "Progress" → new `/progress` rendering the Race goal view (`RaceGoalWorkspace`), with links to Intelligence and Performance. Phases 3 and 4 replace the content behind the same URLs. |
| D2  | Target pace                    | **Approved.** Derive a pace range per intensity in a view model from the athlete's threshold pace, labelled with its basis; omit it rather than guess when physiology has no estimate. No calendar schema change.                                                   |
| D3  | Workout structure              | Recommended: optional `structure?: WorkoutStep[]` on `CalendarWorkout` in Phase 3, populated where the planner already describes intervals.                                                                                                                         |
| D4  | Projection history             | Recommended: chart logged v2 forecasts where they exist, otherwise the current range only ("History builds as forecasts are logged"). Never backcast with the legacy model.                                                                                         |
| D5  | Visual system                  | **Approved:** its own step, Phase 1b, before Today. Tokens first; warm light default with dark as a choice; Geist type scale; WCAG AA enforced by a contrast test.                                                                                                  |
| D6  | Race name                      | **Approved:** add an optional `name` to the race goal, with an input in race setup; fall back to the distance label when empty.                                                                                                                                     |
| D7  | Race status in Phase 2         | **Approved:** build the deterministic Ahead / On track / At risk / Not enough evidence view model in Phase 2 for Today's race outlook; Progress (Phase 4) reuses it.                                                                                                |

## 8. Exit criteria

- No unknown data dependency remains for Phases 1–5: every gap above is either a view-model
  derivation or a listed decision.
- Contract changes are documented before implementation (§6, D2–D3, D6).
- Pre-existing failures are recorded (§1): only the stray-worktree Prettier warning.
