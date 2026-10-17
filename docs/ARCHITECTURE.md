# StrideIQ architecture

StrideIQ is a **Next.js 16** application that ingests Strava activities, normalizes them into a stable domain model, runs deterministic analytics, and exposes results through dashboard pages, an **Athlete Intelligence Model**, and a **Coach** reasoning interface.

## Design principles

1. **UI never reads raw Strava CSV shapes** — parsing stays in `lib/strava`, which emits zod-validated normalized types; features consume those and view models.
2. **Insights before charts** — narrative cards include evidence, severity, and confidence.
3. **LLMs orchestrate; engines decide** — Coach and MCP call tools backed by `lib/analytics`, `lib/reasoning`, and `lib/ecosystem`; the model must not invent metrics.
4. **Running vs ecosystem** — race performance and readiness are run-centric; bike/strength/yoga inform fatigue and interference context only unless explicitly scoped.

## Data paths

### Path A — Local import (privacy-first baseline)

```
Strava export folder (activities.csv + optional activities/*.fit.gz)
        ↓
lib/strava/* parsers
        ↓
lib/strava/parse* → RunActivity[] (zod-validated)
        ↓
lib/analytics (client) + lib/insights
        ↓
React context (StravaProvider) + optional localStorage snapshot
```

- FIT streams: matched via `Filename` in CSV, parsed by `lib/strava/parseFit.ts`, stored in
  **IndexedDB** by `lib/storage/fit-db.ts`.
- Works without Neon or API keys; Coach chat requires server sync for tool-backed answers.

### Path B — Strava API + Neon (hosted sync)

```
OAuth → lib/sync/stravaSync → Neon (users, activities, streams, preferences)
        ↓
GET /api/me/import → StravaImport JSON for browser session
        ↓
Same analytics pipeline in browser (merged with local FIT if present)
```

- Webhooks (`/api/webhooks/strava`) can upsert/delete activities on push events.
- Coach (`POST /api/chat`), MCP, and `GET /api/me/intelligence` require this path (session or API key).

Both paths converge on the same **in-memory analytics** shape (`DashboardInsights`) inside the client after import load.

## Layer map

| Layer                | Location                                              | Responsibility                                                   |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Ingest               | `lib/strava/`, `lib/sync/`, `lib/storage/`            | CSV, API, FIT → raw then domain                                  |
| Domain               | `lib/strava/types.ts`                                 | `RunActivity`, `ActivitySummary`, `AthleteProfile` (zod schemas) |
| Analytics            | `lib/analytics/`                                      | Volume, fatigue, readiness, predictions, efficiency              |
| Insights             | `lib/insights/`                                       | Question-tagged narrative cards                                  |
| Reasoning            | `lib/reasoning/`                                      | compare_sessions, readiness delta, best phase, fade, PR context  |
| Ecosystem            | `lib/ecosystem/`                                      | Multi-sport load, interference, archetype                        |
| Intelligence service | `lib/intelligence/`                                   | Server bundle, tools, chat loop, API auth                        |
| Coach UI state       | `lib/coach/`, `hooks/use-coach-thread.ts`             | Workspace state, threads, response parsing                       |
| Athlete model UI     | `lib/intelligence/athleteState.ts`, `presentation.ts` | Shared selectors for `/intelligence` and Coach context           |
| View models          | `lib/training/`, `lib/goals/`, `lib/report/`          | Page-specific DTOs                                               |
| Route intelligence   | `lib/route-intelligence/`                             | GPS replay timeline, overlays                                    |
| DB                   | `lib/db/`, `db/migrations/`                           | Neon schema, connections, preferences                            |

## Application surfaces

### Training dashboard (question-led IA)

| Route                  | Primary question                                         |
| ---------------------- | -------------------------------------------------------- |
| `/home`                | Summary across improving, training, ready, next, changed |
| `/training`            | Am I training correctly?                                 |
| `/performance`         | Am I improving?                                          |
| `/goals`               | Am I ready for my goal?                                  |
| `/runs`, `/runs/[id]`  | Activity log and execution detail                        |
| `/runs/[id]/route`     | GPS replay (pace, HR, elevation)                         |
| `/report`              | What changed? (printable)                                |
| `/import`, `/settings` | Data load and preferences                                |

`/context` (cross-training / activity ecosystem) is available under the **Advanced** menu.

### Intelligence + Coach (reasoning layer)

| Route           | Role                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| `/intelligence` | **Persistent athlete model** — curated belief, signals, risks, memory, ecosystem, trajectory |
| `/coach`        | **Investigation workspace** — threaded chat, tool-grounded answers, sidebar threads          |

See [COACH_AND_INTELLIGENCE.md](COACH_AND_INTELLIGENCE.md).

## API overview

| Method          | Path                         | Auth                | Purpose                          |
| --------------- | ---------------------------- | ------------------- | -------------------------------- |
| GET             | `/api/auth/strava/authorize` | —                   | Start OAuth                      |
| GET             | `/api/auth/strava/callback`  | —                   | OAuth callback + initial sync    |
| POST            | `/api/auth/logout`           | session             | Sign out                         |
| POST            | `/api/sync/strava`           | session             | Manual re-sync                   |
| POST            | `/api/sync/strava/streams`   | session             | Batch stream/lap sync            |
| GET             | `/api/me/import`             | session             | Activity bundle for client       |
| GET             | `/api/me/status`             | session             | Connection + counts              |
| GET             | `/api/me/fit-details`        | session             | Stream/lap payloads              |
| GET/POST        | `/api/me/preferences`        | session             | Race goal + coach settings       |
| GET/POST/DELETE | `/api/me/training-calendar`  | session             | Persisted weekly plan (calendar) |
| GET             | `/api/me/intelligence`       | session or API key  | Tool execution / brief sections  |
| POST            | `/api/chat`                  | session             | Coach LLM + tool loop            |
| GET/POST        | `/api/webhooks/strava`       | Strava verify token | Push events                      |
| GET             | `/api/health`                | —                   | Health check                     |
| GET             | `/api/backend/health`        | —                   | BFF → FastAPI connectivity probe |

## Python backend (migration in progress)

A FastAPI service in `backend/` is taking over backend capabilities milestone by milestone
([migration plan](ui-overhaul/ARCHITECTURE-MIGRATION.md)). **Milestone A** — foundation
only — is in place; every capability above still runs in TypeScript.

```
Browser ──same-origin──▶ Next route (BFF) ──lib/api-client──▶ FastAPI /api/v1/*
```

- **Contract:** Pydantic schemas (`backend/app/schemas`) → `contracts/openapi.json` →
  generated types in `lib/api-client/generated/backend.ts` (`npm run api:generate`; CI runs
  `npm run api:check` for drift). Never edit generated files.
- **BFF adapter:** `lib/api-client/backend.ts` (typed fetch, per-class timeouts,
  `x-request-id`, never forwards cookies) and `lib/api-client/bff.ts` (error envelope
  `{ error, code, correlation_id }`).
- **Service auth:** [ADR 0001](adr/0001-service-to-service-auth.md). Until it is
  implemented the BFF only calls a loopback backend and the backend refuses to start as
  `preview`/`production`.
- Setup, commands and conventions: [backend/README.md](../backend/README.md). Milestone
  record: [ui-overhaul/MILESTONE-A.md](ui-overhaul/MILESTONE-A.md).

## Intelligence tools (deterministic)

Registered in `lib/intelligence/tools.ts` and exposed to Coach chat and MCP:

**Core:** `get_coach_brief`, `get_readiness`, `get_predictions`, `get_week_plan`, `recommend_today_session`, `get_goal_scenarios`, `get_recommendation_outcomes`, `get_risk_patterns`, `get_monthly_narrative`, `get_pre_race_narrative`, `get_training_phases`, `explain_prediction`, `get_forecast_accuracy`, `get_race_strategy`, `get_fatigue_load`, `list_recent_runs`, `get_data_quality`, `get_connection_status`

**Reasoning:** `compare_sessions`, `explain_readiness_delta`, `find_best_phase`, `attribute_improvement`, `analyze_fade_pattern`, `pr_context`

**Ecosystem:** `get_training_ecosystem`, `get_training_ecosystem_summary`, `get_modality_distribution`, `get_cross_training_support`, `get_interference_risks`, `get_athlete_archetype`, `compare_modality_blocks`, `get_race_week_interference_check`, `get_strength_mobility_support`

## Database migrations

Apply in order on Neon:

1. `001_initial.sql` — users, activities, streams
2. `002_coach.sql` — preferences, race goals
3. `003_route_geometry.sql` — route/GPS storage (PostGIS-ready)
4. `004_training_calendar.sql` — saved weekly plan (calendar week) per user
5. `005_recommendation_log.sql` — recommendation-outcome tracking (adherence log)
6. `006_athlete_memory.sql` — persisted athlete-memory beliefs (accumulating history)
7. `007_forecast_log.sql` — logged race forecasts for self-auditing calibration

Coach preferences, the training calendar, the recommendation log, and athlete memory auto-ensure via their `lib/db/*` modules (`ensure-coach-schema.ts`, `training-calendar.ts`, `recommendation-log.ts`, `athlete-memory.ts`) when their tables are missing.

## Frontend conventions

- **App shell:** `components/app-shell.tsx` → `AppWorkspaceShell` (nav height, coach route body lock).
- **Data hook:** `hooks/useTrainingIntelligence()` — analytics + generated insights for most pages.
- **Shared intelligence:** `hooks/useAthleteIntelligence()` — workspace state for Intelligence + Coach.
- **Styling:** Tailwind v4, dark operational UI, teal accent, amber for risk.

## Testing

```bash
npm test              # vitest — parsers, analytics, reasoning units
npm run build         # production typecheck + compile
npm run backend:check # ruff + mypy + pytest for backend/ (needs uv)
npm run api:check     # generated API contract is up to date (needs uv)
```

## Related packages

- `packages/strideiq-mcp` — MCP server proxying `/api/me/intelligence` tools for external agents.
