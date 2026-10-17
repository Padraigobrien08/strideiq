# StrideIQ backend (FastAPI)

The Python service that will take over domain logic, analytics, persistence and
integrations from the Next.js app, one capability at a time
([migration plan](../docs/ui-overhaul/ARCHITECTURE-MIGRATION.md)).

**Milestone A status:** foundation only. Health and readiness endpoints; **no user
capability runs here yet**, and it cannot be deployed beyond a developer machine until
service-to-service auth is implemented ([ADR 0001](../docs/adr/0001-service-to-service-auth.md)).

```
Browser ──same-origin──▶ Next.js BFF (app/api/*) ──HTTP, loopback only──▶ FastAPI /api/v1/*
```

## Prerequisites

[`uv`](https://docs.astral.sh/uv/) ≥ 0.10. It installs Python 3.12 (`.python-version`)
and the locked dependencies on first run.

## Commands

Run from the repository root:

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run backend:dev`       | Serve on `http://127.0.0.1:8000` with reload                         |
| `npm run backend:test`      | pytest                                                               |
| `npm run backend:lint`      | ruff lint + format check                                             |
| `npm run backend:typecheck` | mypy (strict)                                                        |
| `npm run backend:check`     | All three — what CI runs                                             |
| `npm run api:generate`      | Export OpenAPI → `contracts/openapi.json` → regenerate the TS client |
| `npm run api:check`         | Fail if either generated file is stale (CI)                          |

From `backend/` the equivalents are `uv run pytest`, `uv run ruff check .`,
`uv run mypy`, and
`uv run uvicorn --factory app.main:create_app --host 127.0.0.1 --port 8000 --reload`.

## Connecting the Next app

```bash
# .env.local
STRIDEIQ_BACKEND_URL=http://127.0.0.1:8000
```

Then with both servers running, `GET http://localhost:3000/api/backend/health` returns the
backend's health through the BFF. Use `127.0.0.1` rather than `localhost`: Node can
resolve `localhost` to `::1` while uvicorn listens on IPv4.

## Endpoints

| Path                   | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `GET /api/v1/health`   | Liveness: service, contract version, environment  |
| `GET /api/v1/ready`    | Readiness checks; `503` when a dependency is down |
| `/api/v1/openapi.json` | Live OpenAPI (the committed copy is the contract) |
| `/api/v1/docs`         | Swagger UI                                        |

## Conventions

- **Configuration** — `app/config.py`, `STRIDEIQ_BACKEND_*` variables:
  `ENVIRONMENT` (`local` | `test`; `preview`/`production` refuse to start until ADR 0001 is
  implemented) and `LOG_LEVEL`.
- **Versioning** — every route lives under `/api/v1`.
- **Errors** — every non-2xx body is `ErrorResponse`
  `{ error, code, correlation_id }`. Unhandled exceptions become a generic 500
  (`internal_error`); their text is logged, never returned. Validation errors omit field
  detail so athlete input is not echoed.
- **Correlation IDs** — `x-request-id` is accepted when it matches
  `[A-Za-z0-9._:-]{8,128}`, otherwise replaced with a UUID, and always echoed on the
  response and in every log line.
- **Logs** — one JSON line per event on stderr (`level`, `time`, `event`, fields), the same
  shape as `lib/observability/logger.ts`.
- **Schemas** — Pydantic transport schemas in `app/schemas/` are the contract's source of
  truth. Never edit `contracts/openapi.json` or `lib/api-client/generated/` by hand.

## Layout

```
app/
  main.py            # create_app() factory
  config.py          # typed settings
  correlation.py     # correlation-ID middleware, request log, last-resort 500
  errors.py          # exception handlers → ErrorResponse
  log.py             # JSON logging
  export_openapi.py  # `python -m app.export_openapi` → stdout
  api/               # routers (mounted under /api/v1)
  schemas/           # Pydantic transport schemas
tests/
```

`domain/`, `services/`, `analytics/`, `integrations/`, `persistence/` and `workers/` from the
migration plan are added by the milestone that first needs them, not as empty folders.
