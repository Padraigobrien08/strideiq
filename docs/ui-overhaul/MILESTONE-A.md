# Milestone A — Python foundation (record)

Implements Milestone A of [ARCHITECTURE-MIGRATION.md](./ARCHITECTURE-MIGRATION.md): a FastAPI
service, a generated TypeScript contract and a BFF connectivity probe. **No user capability
has moved.** No production traffic is routed to the backend.

## 1. Inventory of the current backend (TypeScript, all still active)

### Next API routes (`app/api/**/route.ts`)

| Area         | Routes                                                                                                                                        | Auth                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Auth         | `auth/strava/authorize`, `auth/strava/callback`, `auth/logout`                                                                                | — / session                                           |
| Sync         | `sync/strava`, `sync/strava/streams`                                                                                                          | session                                               |
| Athlete data | `me/import`, `me/status`, `me/fit-details`, `me/fit-details/[activityId]`, `me/athlete-stats`, `me/strava`, `me/leg-feel`, `me/preferences`   | session                                               |
| Planning     | `me/training-calendar`, `me/weekly-plan`, `me/coach/plan`                                                                                     | session                                               |
| Intelligence | `me/intelligence`, `me/coach-composite`, `me/coach/memory`, `me/forecast-accuracy`, `me/recommendation-outcomes`, `me/learning/observability` | session or API key (`intelligenceContextFromRequest`) |
| Coach        | `chat`                                                                                                                                        | session (also accepts API key via the same helper)    |
| Webhooks     | `webhooks/strava`, `webhooks/strava/subscribe`                                                                                                | Strava verify token + `X-Strava-Signature`            |
| Probe        | `health` (Next config + DB reachability)                                                                                                      | —                                                     |
| **New (A)**  | `backend/health` — BFF → FastAPI connectivity                                                                                                 | —                                                     |

### Cross-cutting

- **Authentication** — `lib/auth/session.ts`: HMAC-SHA256 signed cookie `strideiq_session`
  (`userId.exp.sig`, 30 days, `SESSION_SECRET`). `lib/intelligence/auth.ts` adds the
  `x-strideiq-api-key` path for MCP/automation (one mapped user, constant-time compare).
- **Database** — `lib/db/client.ts` picks Neon HTTP or `postgres` (node-postgres) from the
  `DATABASE_URL` host; modules under `lib/db/*`; SQL migrations in `db/migrations/`
  applied by `scripts/migrate.mjs`. Some modules auto-ensure their tables.
- **Strava** — OAuth + token refresh in `lib/strava/api/{client,config}.ts`; sync in
  `lib/sync/{stravaSync,stravaStreams,singleActivity}.ts`; webhook verification and
  subscription in `lib/strava/webhooks/*`.
- **Analytics entry points** — `lib/analytics/index.ts#computeInsights` builds
  `DashboardInsights`; it runs in the browser (`hooks/useTrainingIntelligence`) and on the
  server via `lib/intelligence/service.ts#computeAthleteIntelligence`, which feeds the tool
  registry `lib/intelligence/tools.ts#executeIntelligenceTool`. Forecasting lives in
  `lib/forecasting-v2/*`; reasoning primitives in `lib/reasoning/*`.
- **Coach** — `POST /api/chat` → `lib/intelligence/chat.ts#runCoachChat` (OpenAI or
  Anthropic) with a tool loop. **Not streamed today:** it returns one JSON
  `{ reply, toolsUsed }`. Streaming through the BFF is new work for Milestone F.
- **Error shape** — every route returns `{ error: string }` (sometimes `details`) with an
  HTTP status. No correlation IDs existed before this milestone.
- **Logging** — `lib/observability/logger.ts`: JSON lines with redaction.

## 2. Decisions

| Decision                | Value                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend location        | `backend/` (uv project; Python 3.12). Layout in [backend/README.md](../../backend/README.md).                                                                                                                                                                                                                    |
| Runtime dependencies    | `fastapi`, `pydantic-settings`, `uvicorn` — nothing else.                                                                                                                                                                                                                                                        |
| Dev dependencies        | `pytest`, `httpx2` (Starlette's TestClient transport), `ruff`, `mypy`. Node: `openapi-typescript` (dev only).                                                                                                                                                                                                    |
| Local service URL       | `http://127.0.0.1:8000`, set in `.env.local` as `STRIDEIQ_BACKEND_URL` (server-only). `127.0.0.1` not `localhost`, to avoid Node resolving `::1` against an IPv4 listener.                                                                                                                                       |
| API versioning          | FastAPI serves everything under `/api/v1`. Browser-facing Next paths are unchanged.                                                                                                                                                                                                                              |
| Error envelope          | `{ error, code, correlation_id }` on both sides — a superset of the existing `{ error }`. Defined once in Pydantic (`ErrorResponse`) and generated into TS. BFF infra codes: `backend_not_configured` 503, `backend_disabled` 503, `backend_unreachable` 502, `backend_bad_response` 502, `backend_timeout` 504. |
| Correlation ID          | `x-request-id`; inbound value reused only if it matches `[A-Za-z0-9._:-]{8,128}`, else a new UUID. BFF forwards it; FastAPI echoes it and logs it on every line.                                                                                                                                                 |
| Timeouts (total budget) | health 2 s · ordinary read 5 s · plan generation 30 s · Coach stream 120 s (`BACKEND_TIMEOUTS_MS` in `lib/api-client/backend.ts`).                                                                                                                                                                               |
| OpenAPI generation      | `npm run api:generate` → `uv run --locked … python -m app.export_openapi` → `contracts/openapi.json` → `openapi-typescript` → `lib/api-client/generated/backend.ts`. `npm run api:check` regenerates in memory and fails on any byte difference.                                                                 |
| Generated-client shape  | Types only (`openapi-typescript`) + a ~150-line handwritten adapter (`lib/api-client/backend.ts`). No runtime client library.                                                                                                                                                                                    |
| Service auth            | [ADR 0001](../adr/0001-service-to-service-auth.md): loopback only now; signed short-lived identity assertion proposed for later. Backend refuses to start as `preview`/`production`.                                                                                                                             |
| CI                      | New `backend` job: `uv sync --locked`, `npm run backend:check`, `npm run api:check`. Existing `build`, `coverage`, `time-travel` and CodeQL jobs unchanged.                                                                                                                                                      |

### Trade-offs worth knowing

- **Types-only generation vs `openapi-fetch`/`@hey-api`.** Zero runtime weight and the BFF
  concerns (timeout, envelope, no cookie forwarding) stay auditable in one file. Cost: the
  adapter's generic types are handwritten, and only `GET` exists so far. If it grows past
  GET + POST + streaming, `openapi-fetch` (≈6 kB, typed by the same generated `paths`) is
  the drop-in replacement.
- **Committed generated files are excluded from Prettier.** The drift check compares bytes;
  reformatting would make it depend on the Prettier version too.
- **`npm run check` does not run Python.** It must keep working for contributors without
  `uv`; CI covers Python in its own job.

## 3. Baseline (before any change, on `docs/ui-overhaul-spec` @ `302617f`)

| Command         | Result                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` | **Fails — pre-existing.** tsc, prettier, eslint pass; vitest: 1 failed / 1926 passed / 36 skipped. `lib/coach/__tests__/staleClaims.test.ts` "still green-lights quality for a rested athlete who is training" expects freshness ≥ 70, gets 69. Unrelated to this milestone. |
| `npm run build` | Passes.                                                                                                                                                                                                                                                                      |

## 4. Exit criteria

- Local Next → BFF → FastAPI health request works: `GET /api/backend/health` with both
  servers running.
- Generation is reproducible: `npm run api:check` passes on a clean tree; the pytest
  suite asserts the export is deterministic and ignores the shell environment.
- No user capability moved: no existing route, hook, component or `lib/` module imports
  `lib/api-client`; the only caller is `app/api/backend/health/route.ts`.

## 5. Recommended Milestone B pilot

**`weeklyVolume` and `fitnessIndex`** (`lib/analytics/volume.ts`,
`lib/analytics/trainingLoad.ts`).

- Pure functions of `RunActivity[]` — no I/O, no `Date.now()` (unlike `lastNDaysVolume`,
  which should stay out of the pilot), ~100 lines total.
- Exercise both parity categories cheaply: exact (week bucketing, run counts) and
  tolerance (summed kilometres, EMA).
- Surface the riskiest cross-language rule early and in isolation: **week bucketing via
  `date-fns` `parseISO` + `startOfWeek` uses the local time zone.** Python must reproduce
  that deliberately, and the same rule underpins forecasting (Milestone C) and calendar
  matching (Milestone D). Better to discover it on a volume chart than on a race forecast.
- Widely consumed (goals, performance, report, training views), so parity fixtures pay off
  later, while a fallback to the TypeScript implementation is trivial.
