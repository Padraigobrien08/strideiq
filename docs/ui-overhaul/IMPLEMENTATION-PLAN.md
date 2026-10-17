# Claude Code implementation plan

## 1. Repository map and reuse strategy

The overhaul should recompose existing domain logic rather than replace it.

| Concern                   | Existing entry points                                                                                  | Intended use                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| App shell and navigation  | `components/nav.tsx`, `components/workspace/shell.tsx`                                                 | Replace top-level IA and add persistent contextual Coach action                             |
| Today                     | `app/home/page.tsx`, `components/home/console/home-console.tsx`, `lib/home/operatingSystemView.ts`     | Retain data assembly; replace equal-weight console composition                              |
| Weekly planning           | `app/plan/page.tsx`, `components/plan/*`, `hooks/use-weekly-plan.ts`, `hooks/use-training-calendar.ts` | Reuse calendar, generation, validation, history and planned-vs-actual logic in Training     |
| Activities                | `app/runs/page.tsx`, `app/runs/[id]/page.tsx`, `components/runs/*`, `components/run-detail/*`          | Preserve as Training drill-ins; add current-week access without duplicating run analysis    |
| Training analytics        | `app/training/page.tsx`, `components/training/*`                                                       | Rehome as Progress supporting analysis or retain as a deep view                             |
| Race goal and forecasting | `app/goals/page.tsx`, `components/goals/*`, `lib/goals/*`, `lib/forecasting-v2/*`                      | Primary data and components for Progress                                                    |
| Intelligence              | `app/intelligence/page.tsx`, `components/intelligence/*`, `hooks/use-athlete-intelligence.ts`          | Preserve as deeper read-first evidence/model surface behind Progress                        |
| Coach                     | `app/coach/page.tsx`, `components/coach/*`, `hooks/use-coach-thread.ts`, `lib/coach/*`                 | Add source context, contextual history and structured proposal review                       |
| Plan persistence          | `lib/training-calendar/*`                                                                              | Sole confirmed-plan boundary; extend with proposal validation rather than bypassing it      |
| Styling                   | `app/globals.css`, existing UI primitives                                                              | Evolve tokens and compositions within Tailwind v4; do not introduce a second styling system |

## 2. Working rules

1. Read repository-root `AGENTS.md` before implementation.
2. Run the baseline verification suite before changing code.
3. Keep existing analytics and normalized data contracts intact unless a required UI state cannot be expressed.
4. Prefer adapters/view models over changing low-level analytics return types.
5. Do not delete old routes until replacements pass acceptance tests and inbound links are migrated.
6. Implement one phase at a time and keep commits phase-scoped.
7. At the end of each phase, run targeted tests plus `npm run typecheck` and `npm run lint`.
8. Before final delivery, run `npm run check` and `npm run build`.
9. Visually verify at desktop and mobile widths after every screen phase.

## 3. Phase 0 — Baseline and contract audit

### Work

- Run `npm run check` and `npm run build`; record pre-existing failures.
- Trace the actual data available for today's workout, race forecast, weekly comparison and Coach plan generation.
- Confirm whether `TrainingCalendarWeek` can represent every proposal field required by the spec.
- Confirm how forecast history and confidence are stored and whether the projection chart can use real history.
- Search all inbound links to `/plan`, `/runs`, `/training`, `/goals`, `/performance`, `/intelligence` and `/coach`.
- Add a route migration table to this document if actual code differs from the map above.

### Exit criteria

- No unknown data dependency remains for Phases 1–5.
- Any contract changes are documented before implementation.
- Existing failures are distinguished from overhaul regressions.

## 4. Phase 1 — Application shell and navigation

### Primary files

- `components/nav.tsx`
- `components/workspace/shell.tsx`
- `components/command-palette.tsx`
- `app/layout.tsx` if metadata or landmarks require changes
- New route(s): `app/progress/page.tsx`

### Work

- Replace five primary links with Today, Training and Progress.
- Add a persistent **Ask Coach** action that includes safe current-page context through existing `coachUrl`/domain-link utilities.
- Preserve Search, Settings, theme and demo/source metadata without letting them overpower primary navigation.
- Give active destinations an accessible non-colour indicator.
- Keep compatibility destinations in the command palette and drill-in links.
- Add a skip-to-content link and confirm semantic header/nav/main landmarks.

### Tests

- Update `components/__tests__/command-palette.test.tsx`.
- Add navigation tests for active state, destination count and Coach context link.
- Verify keyboard focus order.

### Exit criteria

- Exactly three primary destinations render.
- Existing deep routes remain reachable.
- Coach is reachable from every primary screen.
- Mobile navigation does not overflow or obscure content.

## 5. Phase 2 — Today

### Primary files

- `app/home/page.tsx`
- `components/home/console/home-console.tsx`
- `lib/home/operatingSystemView.ts`
- `components/home/primitives/*`
- New focused Today components under `components/home/today/*` if decomposition is helpful

### Work

- Retain the current hooks and `buildHomeOperatingSystemView` where data remains valid.
- Replace the stacked console with the 65/35 daily briefing composition.
- Build explicit variants for planned run, rest day, no plan, past goal, no race and readiness exception.
- Derive duration and target pace from structured plan fields; do not infer display values in prose.
- Move recent-change feed and generic risks/opportunities off Today into Progress/Intelligence.
- Link race outlook to Progress and the week link to Training.
- Keep sync errors and source status accessible but visually secondary.

### Reuse

- `findTodayWorkout` behavior must remain date-safe.
- Reuse existing race goal stores and forecast view models rather than adding duplicate state.
- Reuse `RequireData` and existing demo flow.

### Tests

- Extend `components/home/__tests__/home-drill-in.test.tsx`.
- Add Today tests for run, rest, no race, no plan and readiness-exception states.
- Assert removed panels are no longer part of the default Home render.

### Exit criteria

- Session type, distance, duration and pace are above the fold at 1440 × 900.
- Rest days show actionable recovery guidance.
- Routine readiness is absent; material warnings appear.
- Coach opens with the session context attached.

## 6. Phase 3 — Training

### Primary files

- `app/training/page.tsx`
- `app/plan/page.tsx`
- `app/runs/page.tsx`
- `components/plan/plan-workspace.tsx`
- `components/plan/plan-week-board.tsx`
- `components/plan/plan-mobile-week-swiper.tsx`
- `components/plan/plan-week-execution.tsx`
- `lib/training-calendar/*`

### Work

- Make `/training` the canonical current-week surface.
- Compose a seven-day strip and selected-day detail using existing calendar and matching logic.
- Make selected-day state URL-safe when practical (for example `?date=YYYY-MM-DD`).
- Upcoming/current sessions render the prescription and workout structure.
- Completed sessions render planned-versus-actual comparison and link to `/runs/[id]`.
- Integrate activity history as a secondary Training view or clear drill-in; do not duplicate the entire Runs workspace.
- Preserve plan generation, preview, validation, history, undo and replace confirmation.
- Keep `/plan` as a compatibility route until all links migrate.

### Tests

- Extend plan workspace and week board tests.
- Add selection tests covering upcoming, completed, skipped, changed and rest days.
- Retain `lib/training-calendar/__tests__/*` as regression coverage.
- Test the mobile horizontal strip and initial Today positioning at the component level.

### Exit criteria

- Current week is the default.
- Detail always matches selected day.
- Planned-versus-actual data is shown only for the relevant completed selection.
- Generation and save behavior remain intact.

## 7. Phase 4 — Progress

### Primary files

- New `app/progress/page.tsx`
- New `components/progress/*`
- Existing `components/goals/*`
- Existing `components/performance/*`
- Existing `components/intelligence/*`
- `lib/goals/*`, `lib/forecasting-v2/*`, `hooks/use-forecast-accuracy.ts`

### Work

- Build a new goal-facing overview rather than renaming the full Intelligence page.
- Create a Progress view model that combines existing goal/forecast output with selected, relevant evidence signals.
- Map model output into Ahead, On track, At risk or Not enough evidence using explicit deterministic thresholds.
- Show estimate range, confidence, last update and provenance.
- Use existing forecast history/calibration data for the projection chart; do not fabricate historical points.
- Implement adaptive detail: concise healthy state, expanded uncertainty/at-risk explanation.
- Preserve `/intelligence` as the deeper belief/evidence model and link it from Projection details or full analysis.
- Treat CTL/ATL/TSB and other training analytics as supporting detail, not the overview headline.

### Required honesty rules

- The LLM cannot supply the displayed status, estimated time or confidence.
- Missing or weak data produces Not enough evidence.
- Display a range rather than an exact future time.
- Every evidence signal exposes source/date and directional contribution.

### Tests

- Add pure view-model tests for all four statuses and threshold boundaries.
- Add UI tests for healthy, uncertain, at-risk, no-race and insufficient-data states.
- Retain forecast calibration and honesty tests.
- Add accessible chart summary/table tests.

### Exit criteria

- Status is understandable before technical detail.
- All displayed figures trace to analytics output.
- Evidence and methodology are inspectable.
- Intelligence remains read-first and separate from Coach.

## 8. Phase 5 — Coach context and proposal verification

### Primary files

- `app/coach/page.tsx`
- `components/coach/coach-reasoning-workspace.tsx`
- `components/coach/coach-mini-context.tsx`
- `components/coach/weekly-plan-response.tsx`
- `hooks/use-coach-thread.ts`
- `lib/coach/domainLinks.ts`
- `lib/coach/threadStorage.ts`
- `lib/training-calendar/*`
- `app/api/me/coach/plan/*` and plan schemas only if the proposal contract requires extension

### Work

- Define a typed `CoachSourceContext` for Today, Training, Activity and Progress entry points.
- Store context metadata with threads so history remains attached to its source object.
- Keep simple context in the banner; use a side panel for proposals and deeper review.
- Convert weekly plan responses into explicit proposal state; do not save on generation.
- Define a typed proposal/diff model with original, proposed, changed fields and downstream impact.
- Add direct controls for day, session type, distance/duration and target effort.
- Re-run existing calendar validation after each edit.
- Make `Update plan` the only mutation boundary and snapshot history first so undo remains real.
- Mark proposals stale when their source week revision changes.

### Tests

- Extend Coach thread storage tests for contextual history.
- Add proposal schema, diff, stale-source and validation tests.
- Add UI tests proving conversation and proposal generation do not save the plan.
- Add a test proving only Update plan mutates storage.
- Add tests for Keep current plan, invalid proposal and changed underlying week.

### Exit criteria

- Source context is always visible or expandable.
- Proposal data is structured and editable.
- Downstream totals recalculate before approval.
- Abandoned, failed or stale conversations cannot mutate the confirmed plan.

## 9. Phase 6 — Responsive states, accessibility and finish

### Work

- Implement the specified mobile compositions rather than scaled desktop grids.
- Add loading, empty, partial-data, error and stale-data states for all primary screens.
- Ensure charts have textual summaries and data tables.
- Audit contrast, focus, heading order, landmarks and live-region announcements.
- Replace incidental tiny text where it carries decision-critical information.
- Verify 320, 390, 768, 1024, 1280 and 1440 px widths.
- Remove obsolete default-dashboard components only after route migration and regression checks.

### Verification

```bash
npm run typecheck
npm run format:check
npm run lint
npm test
npm run build
```

### Exit criteria

- All acceptance tests pass.
- No primary workflow depends on hover.
- No horizontal page overflow exists at mobile widths.
- Existing import, sync, demo, settings and deep activity flows remain functional.

## 10. Commit strategy

Recommended commits:

1. `docs: add approved UI overhaul contract`
2. `feat(shell): simplify primary navigation`
3. `feat(today): introduce daily briefing hierarchy`
4. `feat(training): consolidate the current week workspace`
5. `feat(progress): add explainable race progress overview`
6. `feat(coach): add verified plan proposal flow`
7. `fix(ui): complete responsive and accessibility states`

Do not mix analytics rewrites into visual phases. If a genuine contract gap appears, isolate and test it in its own commit.
