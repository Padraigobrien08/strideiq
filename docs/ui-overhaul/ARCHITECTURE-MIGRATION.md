# TypeScript-to-Python backend migration

**Status:** Approved direction  
**Migration style:** Incremental milestones  
**Frontend:** Next.js + React  
**Backend:** Python + FastAPI

## 1. Target architecture

```text
Browser
  ↓ same-origin HTTP
Next.js frontend and thin BFF
  ↓ typed server-to-server HTTP
FastAPI
  ├── Strava ingestion, OAuth and webhooks
  ├── PostgreSQL persistence
  ├── Training and race analytics
  ├── Forecasting and confidence
  ├── Training-calendar rules and plan generation
  ├── Coach tools and orchestration
  └── Background jobs
```

Next.js remains the React application. It owns pages, layouts, components, client state, presentation-focused view models and a thin same-origin BFF. It must not accumulate new business logic during migration.

FastAPI becomes the owner of domain logic, data access, integrations, analytics and AI orchestration.

## 2. Approved decisions

1. Do not replace Next.js with Vite.
2. Browser requests use the same-origin Next.js BFF rather than calling FastAPI directly.
3. Migrate by capability; do not perform a big-bang rewrite.
4. Keep the TypeScript implementation active until its Python replacement passes parity tests.
5. FastAPI/Pydantic owns external API request and response schemas.
6. FastAPI publishes OpenAPI; the repository generates the Next.js TypeScript client and types.
7. Generated client files are never edited manually.
8. CI fails when generated output is stale or contract tests fail.
9. One capability has one active owner at runtime. Do not dual-write or blend two algorithms silently.
10. Preserve the UI overhaul's core boundary: deterministic services compute numbers; the LLM explains and proposes.

## 3. Repository shape

Target structure:

```text
app/                       # Next.js routes and thin BFF handlers
components/                # React presentation
hooks/                     # UI-facing hooks calling the typed client/BFF
lib/api-client/            # generated client + small handwritten adapter
backend/
  app/
    api/                   # FastAPI routers
    schemas/               # Pydantic transport schemas
    domain/                # domain models and pure rules
    services/              # application orchestration
    analytics/             # training and race analytics
    integrations/          # Strava, OpenAI and external systems
    persistence/           # repositories and database access
    workers/               # background jobs
    main.py
  tests/
  pyproject.toml
contracts/
  fixtures/                # language-neutral parity fixtures
  snapshots/               # expected outputs where appropriate
```

Exact naming may adapt to existing conventions, but boundaries must remain explicit.

## 4. BFF rules

The Next.js BFF may:

- Read the authenticated browser session.
- Forward identity and authorized requests to FastAPI.
- Normalize infrastructure errors into the existing UI error envelope.
- Apply request timeouts and correlation IDs.
- Stream FastAPI responses when the UI requires streaming.

The BFF must not:

- Reimplement analytics or validation.
- Query the database directly after that capability has moved.
- Contain a second copy of Pydantic business rules.
- Parse LLM prose into domain mutations.

## 5. Contract generation

- Pydantic models are the transport-schema source of truth.
- Export a pinned OpenAPI document in CI.
- Generate TypeScript types/client using a single documented command.
- Commit generated output so frontend changes are reviewable.
- CI regenerates and fails on a dirty diff.
- Keep domain models separate from transport schemas on both sides when behavior requires it.
- Use explicit API versioning, beginning with `/api/v1` on FastAPI. The browser-facing Next routes may keep current paths while proxying internally.

Required foundation commands should eventually include:

```text
npm run api:generate
npm run api:check
python -m pytest backend/tests
```

Claude must choose the generator only after inspecting current tooling and should avoid adding a runtime-heavy client library when a lightweight generated fetch client is sufficient.

## 6. Authentication and secrets

- The browser keeps same-origin secure session cookies with Next.js.
- Next validates the session and sends a short-lived, server-to-server identity assertion or trusted internal credential to FastAPI.
- Never forward browser cookies wholesale to FastAPI.
- FastAPI independently authorizes the user/resource relationship.
- Strava and OpenAI credentials live only in server environments.
- Service-to-service traffic must be authenticated outside local development.
- Document local development, preview and production origins separately.

The precise identity-token mechanism is a Phase 0 decision and must be recorded in an ADR before protected endpoints migrate.

## 7. Data and parity strategy

### Language-neutral fixtures

Create sanitized JSON fixtures from normalized Strava domain data, not raw CSV. Fixtures cover:

- Sparse beginner history
- Consistent race build
- Multi-sport athlete
- Training disruption
- Rest/return from injury
- Low-confidence forecast
- Planned-versus-actual calendar week

### Parity categories

- **Exact parity:** categorical classification, dates, statuses, validation issues and plan mutation rules.
- **Tolerance parity:** floating-point analytics and forecast ranges using documented tolerances.
- **Behavioral parity:** narrative ordering or explanation fields where wording need not match exactly but provenance and conclusions must.

Every migrated capability requires golden TypeScript outputs before Python implementation begins. Differences must be explained and approved; never silently bless new snapshots.

## 8. Milestones

### Milestone A — Python foundation, no production traffic

- Add `backend/` FastAPI application, configuration and health endpoint.
- Add Python lint, typing and pytest configuration.
- Add OpenAPI export and generated TypeScript client.
- Add Next BFF connectivity and timeout/error envelope.
- Decide service authentication in an ADR.
- Add CI jobs without removing existing checks.

**Exit:** local Next → BFF → FastAPI health request works; generation is reproducible; no user capability has moved.

### Milestone B — Pure analytics pilot

- Select one low-risk, pure analytics capability with good fixtures.
- Capture TypeScript golden outputs.
- Port it to Python without redesigning its behavior.
- Run cross-language parity tests.
- Add an internal per-capability routing flag with TypeScript fallback.
- Observe differences before making Python the default.

**Exit:** one capability runs from Python with parity evidence and a documented rollback.

### Milestone C — Forecasting and progress analytics

- Port race prediction, confidence, evidence provenance and forecast history calculations as coherent services.
- Preserve honesty thresholds and Not enough evidence behavior.
- Move read endpoints used by Progress behind the BFF.
- Keep LLMs outside numerical calculation.

**Exit:** Progress consumes Python-computed projections through the generated client; TypeScript implementation is retired only after parity passes.

### Milestone D — Calendar rules and plan generation

- Port calendar validation, planned-versus-actual matching, proposal diffs and plan generation orchestration.
- Preserve snapshots, revisions and undo semantics.
- Make Python validate every proposed mutation.
- Keep Update plan as the single write boundary.

**Exit:** Training and verified Coach proposals use Python services without weakening plan safety.

### Milestone E — Persistence and Strava integrations

- Introduce Python repositories over the existing PostgreSQL schema.
- Move import processing, Strava OAuth, sync and webhooks in separately deployable steps.
- Use idempotency keys for imports and webhook handling.
- Avoid dual writes; use shadow reads or read comparison when validation is needed.

**Exit:** FastAPI owns persistence and integrations; Next has no direct database or Strava business logic.

### Milestone F — Coach tools and orchestration

- Port deterministic Coach tools first.
- Port tool registry and orchestration after tool parity is established.
- Preserve source context, tool audit metadata and failure isolation.
- Stream through the Next BFF without buffering the full response.

**Exit:** Coach is Python-orchestrated, tool-grounded and unable to bypass proposal verification.

### Milestone G — TypeScript backend retirement

- Search for remaining server-side domain logic and direct database/integration access.
- Remove obsolete implementations only after traffic and parity gates pass.
- Remove migration flags and fallback code capability by capability.
- Update architecture, deployment and incident documentation.

**Exit:** Next.js contains frontend/BFF responsibilities only; FastAPI is the backend system of record.

## 9. Sequencing with the UI overhaul

- Complete Milestone A before relying on new Python-only UI capabilities.
- UI shell and presentational work may proceed against existing BFF routes.
- Keep browser-facing contracts stable while moving implementations behind them.
- Do not combine a screen redesign and an algorithm port in the same commit.
- Progress should initially consume existing forecast contracts; move the implementation in Milestone C after the UI behavior is testable.
- Coach proposal UI may be designed before Milestone D, but mutation authority moves only with validated Python contracts.

## 10. Deployment and operations requirements

- Frontend and backend deploy independently.
- Preview environments must pair compatible frontend/backend contract versions.
- FastAPI needs health/readiness endpoints and structured logs.
- Propagate correlation IDs from browser-facing BFF requests.
- Define timeouts for ordinary reads, plan generation and streamed Coach requests separately.
- Database migrations must remain single-owner and forward-compatible during mixed-version deployments.
- Every capability switch needs a rollback that does not require data repair.

The hosting provider is intentionally not selected in this document. Choose it after confirming background-job, streaming, region, database-network and cost requirements.

## 11. Definition of done

- Next.js contains no analytics, persistence, integration or AI orchestration implementation beyond BFF/session glue.
- FastAPI owns documented versioned APIs for all backend capabilities.
- The TypeScript client is generated from OpenAPI and verified in CI.
- Cross-language parity evidence exists for every migrated deterministic capability.
- No dual-write path remains.
- Existing UI acceptance tests continue to pass.
- Import, sync, planning, forecast and Coach workflows have tested failure and rollback behavior.
- Repository documentation accurately describes the final ownership boundaries.
