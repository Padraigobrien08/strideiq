<div align="center">

# StrideIQ

**Private training intelligence for runners**

Import Strava data. Get evidence-backed insights. Plan your week. Investigate _why_ with a tool-grounded Coach.

**[Open the live demo →](https://strideiq-lemon.vercel.app)**

[Quick start](#quick-start) · [Features](#features) · [Deploy](#deploy) · [Docs](#documentation)

[![CI](https://github.com/Padraigobrien08/strideiq/actions/workflows/ci.yml/badge.svg)](https://github.com/Padraigobrien08/strideiq/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Padraigobrien08/strideiq/actions/workflows/codeql.yml/badge.svg)](https://github.com/Padraigobrien08/strideiq/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-14b8a6.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)

</div>

---

StrideIQ is a **local-first** Next.js app that turns Strava exports (or live API sync) into a coherent training operating system — not another chart dashboard. Deterministic engines compute metrics; the Coach and LLM layers **orchestrate tools** and must not invent numbers.

**See it now: [strideiq-lemon.vercel.app](https://strideiq-lemon.vercel.app) → “Try the demo”.** That loads a 12-month sample athlete into your browser and every surface below becomes live — no account, no database, no API key, nothing to install. The deployment runs with zero environment variables set, so Coach chat is off there (the rest of the Coach workspace still computes); [run it locally](#quick-start) with your own key for that.

> **Status:** MVP (`v0.1.0-mvp`) — private beta  
> **Start here:** [**What is validated, and what is not**](docs/LIMITATIONS.md) — which claims in
> this repository have been checked against reality, and which are only implemented and tested.

---

## ⚡ Try the demo (zero setup)

**Hosted — nothing to install:** open **[strideiq-lemon.vercel.app](https://strideiq-lemon.vercel.app)** and click **“Try the demo.”**

**Locally, from a clone:**

```bash
npm install
npm run dev
```

…then open **[http://localhost:3000](http://localhost:3000)** and click the same button.

Either way it loads a full **12-month sample athlete** (mid-build for a sub-1:45 half marathon) so you can explore _every_ client-side surface instantly — **no Strava account, no database, no API key**. Hit **Exit demo** in the header to clear it. Prefer your own data? Use **Import** (100% in-browser) — see [Quick start](#quick-start).

The hosted deployment runs with **zero environment variables**, which is the same Path A configuration described in [Quick start](#quick-start). That is deliberate — it is the honest demonstration that the export-only path needs no backend. The consequences are visible and intended: `/api/health` reports `"status":"incomplete"`, Coach chat returns 503 (the deterministic half of the Coach workspace still computes), and Strava sync is absent.

![StrideIQ Home — console briefing on a live Strava account: today's focus, readiness and TSB, and the return-to-running ramp after fifteen days off](docs/screenshots/home.png)

<sub>Home and Coach are a live Strava-synced account, caught mid-comeback after a training gap. Intelligence and Goals are the built-in demo athlete. Every number in all four is computed by the deterministic engines, not written by a model.</sub>

---

## Table of contents

- [Try the demo](#-try-the-demo-zero-setup)
- [Why StrideIQ](#why-strideiq)
- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Deploy](#deploy)
- [Routes](#routes)
- [Coach, API & MCP](#coach-api--mcp)
- [Development](#development)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why StrideIQ

| Typical Strava tooling | StrideIQ                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| Charts and totals      | Question-led surfaces (“Am I ready?” “What changed?”)              |
| Static dashboards      | **Athlete Intelligence Model** — curated belief state              |
| Generic AI chat        | **Coach** with deterministic tool-use over your data               |
| Disconnected planning  | **Adaptive week plan** with context, save, and execution vs actual |

**Design principle:** every screen answers one user question. Insights ship with evidence, confidence, and recommendations — not orphaned graphs.

---

## Features

### Data ingestion

- **Strava bulk export** — `activities.csv` + optional FIT `activities/` folder (two-step import)
- **Strava OAuth** — live sync to Postgres (local Docker or hosted Neon)
- **Webhooks** — optional background activity sync
- **Privacy-first export path** — no account or server required for core analytics

### Training intelligence

| Surface                    | What you get                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **Home**                   | Operating-system layout: focus, week board, change feed, decision support               |
| **Plan**                   | Planning context, AI/rule-based week generation, drag-and-drop board, planned vs actual |
| **Goals**                  | Race briefing, readiness, forecasts, mission control (the **Race goal** tab of Plan)    |
| **Training & Performance** | Volume, blocks, efficiency, projections, records                                        |
| **Runs**                   | Activity explorer, session intelligence, route replay (MapLibre)                        |
| **Intelligence**           | Persistent athlete belief model — signals, memory, ecosystem (not a chat UI)            |
| **Coach**                  | Investigation workspace — threaded reasoning with server-backed tools                   |
| **Report**                 | Printable training change summary                                                       |

#### Intelligence — the curated belief model

A read-first surface, not a chat window: what the system currently believes, how each signal is
moving, and what to do about it. Every claim carries its evidence and confidence.

![StrideIQ Intelligence — current focus and belief, how each signal is moving, and decision support split into risks, opportunities, and a primary action](docs/screenshots/intelligence.png)

#### Goals — forecasts that admit what they don't know

The forecast reports a range and a confidence, then names its own weakest assumption. Here the
engine holds the band open because its models have never been scored against a race this athlete
actually ran: _"The models agree with each other, which is not the same as being right."_

![StrideIQ Goals — half-marathon forecast of 1h 37m with a realistic range, evidence list, explicit confidence reasoning, and a limitations panel](docs/screenshots/goals.png)

#### Coach — threaded investigation over deterministic tools

The Coach orchestrates; it does not compute. Numbers come from the same
[44 deterministic tools](#reasoning-tools-deterministic) the HTTP API exposes, and every answer
closes with what it was grounded in, how confident it is, and what it could not see. The reply
below is real, against a live synced account: note the limitation line conceding that a week
without runs limits what the answer can say.

![StrideIQ Coach — a real threaded investigation: two tool-grounded answers, each with a confidence level, the tools they were grounded in, and an explicit limitation line, beside an answer-context rail showing readiness, race, risk and opportunity](docs/screenshots/coach.png)

### Engineering

- **1,800+ Vitest tests** · production `next build` · DB suites run against Postgres in CI
- **shadcn/ui** component layer · DM Sans + Syne typography
- **MCP package** — same intelligence tools in Claude Desktop (`packages/strideiq-mcp`)

---

## How it works

```mermaid
flowchart LR
  subgraph ingest [Ingest]
    CSV[Strava export]
    OAuth[Strava OAuth]
    FIT[FIT streams]
  end

  subgraph core [Core]
    Parsers[lib/strava parse + normalize]
    Analytics[Analytics engines]
    Insights[Insight engine]
  end

  subgraph ui [Surfaces]
    Home[Home / Plan / Goals]
    Intel[Intelligence]
    Coach[Coach]
  end

  CSV --> Parsers
  OAuth --> Parsers
  FIT --> Parsers
  Parsers --> Analytics
  Analytics --> Insights
  Insights --> Home
  Insights --> Intel
  Analytics --> Coach
```

**Two runtime modes**

| Mode            | Storage                                  | Coach / sync              |
| --------------- | ---------------------------------------- | ------------------------- |
| **Export only** | Browser `localStorage` + IndexedDB (FIT) | Client analytics only     |
| **Connected**   | Postgres (local/Neon) + session cookie   | Full Coach, webhooks, MCP |

---

## Quick start

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Docker** — optional, only for the local Postgres in Path B (skip if you use hosted Neon)

### Run locally

```bash
git clone https://github.com/Padraigobrien08/strideiq.git
cd strideiq
npm install
cp .env.example .env.local   # optional — see paths below
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

### Choose your path

| Path                | Setup time | `.env.local`                         | Capabilities                                                     |
| ------------------- | ---------- | ------------------------------------ | ---------------------------------------------------------------- |
| **A — Export only** | ~5 min     | Empty or omit                        | Home, Training, Goals, Plan, Runs, Report, Intelligence (client) |
| **B — Full stack**  | ~20 min    | Strava + Postgres (local/Neon) + LLM | OAuth sync, Coach, webhooks, MCP                                 |

Capability matrix: [docs/RELEASE_MVP.md](docs/RELEASE_MVP.md).

<details>
<summary><strong>Path A — Export only (no API keys)</strong></summary>

1. Strava → **Settings → My Account** → download your data → unzip.
2. **Import** → upload export folder (`activities.csv` required).
3. Optional: upload the `activities/` folder for FIT stream detail.
4. **Home** — confirm runs load.
5. **Goals** — set race distance and date.
6. **Plan** — add optional context → **Generate** → **Save week**.
7. **Settings** — theme toggle; **Clear data** uses a confirmation dialog.

No Strava API app or database required.

</details>

<details>
<summary><strong>Path B — OAuth + Coach</strong></summary>

1. **Scaffold `.env.local`** — generates a `SESSION_SECRET` and presets the local database URL:

   ```bash
   npm run setup
   ```

2. **Set up the database.** Pick one:

   - **Local Postgres (Docker)** — no cloud account:

     ```bash
     docker compose up -d    # Postgres on localhost:5432
     npm run db:migrate      # apply db/migrations/*
     ```

   - **Hosted (Neon or any Postgres):** put its connection string in `DATABASE_URL`, then `npm run db:migrate`.

   The driver is auto-selected from the connection string. `npm run db:reset` rebuilds the schema from scratch.

3. Create a [Strava API application](https://www.strava.com/settings/api). For local dev, set **Authorization Callback Domain** to `localhost`.

4. Fill in the rest of [`.env.local`](.env.example) (`npm run setup` already set `SESSION_SECRET` and `DATABASE_URL`):

   ```bash
   # DATABASE_URL preset to local Docker; replace for Neon:
   #   DATABASE_URL=postgresql://strideiq:strideiq@localhost:5432/strideiq
   STRAVA_CLIENT_ID=...
   STRAVA_CLIENT_SECRET=...
   STRAVA_REDIRECT_URI=          # leave blank — callback follows the host you browse
   OPENAI_API_KEY=sk-...   # or ANTHROPIC_API_KEY
   ```

5. Restart the dev server → **Import → Connect Strava** → sync activities.
6. **Goals** → race goal → **Plan** → generate and save → **Coach** → ask a training question.

</details>

### View on your phone or tablet

StrideIQ runs on your machine but is reachable from other devices.

```bash
npm run dev:lan   # serves on your LAN (0.0.0.0)
npm run lan       # prints the URL to open on your phone + Strava setup hint
```

- **Demo & Strava-export import** work over the LAN URL (`http://<your-ip>:3000`) with no extra setup.
- **Live Strava OAuth** needs the host registered as your Strava app's **Authorization Callback Domain** (the callback follows whatever host you browse, as long as `STRAVA_REDIRECT_URI` is blank):
  - **Same Wi-Fi:** set the callback domain to your machine's LAN IP (shown by `npm run lan`), then open `http://<ip>:3000` on the device.
  - **Anywhere / clean HTTPS:** run a tunnel and register its hostname instead —

    ```bash
    cloudflared tunnel --url http://localhost:3000   # or: ngrok http 3000
    ```

    Set the callback domain to the printed `*.trycloudflare.com` (or ngrok) host and open that URL on any device.

### Verify

```bash
npm test && npm run build
# or
./scripts/verify.sh
```

Manual QA: [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).

---

## Configuration

Copy [`.env.example`](.env.example) to `.env.local`. Never commit `.env.local`.

| Variable                                                            | Required for            |
| ------------------------------------------------------------------- | ----------------------- |
| `DATABASE_URL`                                                      | Strava sync, Coach, MCP |
| `SESSION_SECRET`                                                    | Signed session cookies  |
| `STRAVA_CLIENT_ID` / `SECRET` / `REDIRECT_URI`                      | OAuth                   |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`                             | Coach + AI weekly plan  |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` / `_CALLBACK_URL` / `_SIGNING_SECRET` | Push auto-sync          |
| `STRIDEIQ_API_KEY` + `STRIDEIQ_API_KEY_USER_ID`                     | MCP / automation        |

Production values and callback URLs: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Padraigobrien08/strideiq)

The app builds and runs with **zero environment variables** — the demo and local-export modes work out of the box. Add the variables below only for the optional server features.

Hosted stack: **Vercel** (app) + **Neon** (database) + **Strava** (OAuth + optional webhooks).

| Step                           | Guide                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| Neon migrations                | [docs/DEPLOYMENT.md § Neon](docs/DEPLOYMENT.md#1-neon-database)            |
| Strava callback & webhook URLs | [docs/DEPLOYMENT.md § Strava](docs/DEPLOYMENT.md#2-strava-api-application) |
| Vercel env vars                | [docs/DEPLOYMENT.md § Vercel](docs/DEPLOYMENT.md#3-vercel-project)         |
| Post-deploy smoke test         | [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) Path C                            |

---

## Routes

| Route              | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `/home`            | Training operating system — focus, week, insights    |
| `/plan`            | Adaptive week workspace                              |
| `/goals`           | Redirect → `/plan?tab=goal` (Goals merged into Plan) |
| `/training`        | Volume, blocks, load intelligence                    |
| `/performance`     | Trends, records, projections                         |
| `/runs`            | Activity explorer                                    |
| `/runs/[id]`       | Session execution analysis                           |
| `/runs/[id]/route` | GPS replay (pace, HR, elevation)                     |
| `/intelligence`    | Athlete Intelligence Model                           |
| `/coach`           | Investigation chat                                   |
| `/context`         | Training mix and cross-training context              |
| `/report`          | Printable summary                                    |
| `/import`          | CSV, FIT, Strava OAuth                               |
| `/settings`        | Units, privacy, webhooks, data quality               |

Coach deep links from Intelligence: `?domain=…`, `?q=…`, `?topic=…`, `&investigate=1`.

---

## Coach, API & MCP

### In-app Coach

- Investigation UI: thread, composer, sidebar, context rail
- `POST /api/chat` — OpenAI (preferred) or Anthropic with **tool-use**
- Threads in browser `localStorage`

### HTTP intelligence API

```http
GET /api/me/intelligence?section=brief|readiness|compare_sessions|...
```

Auth: session cookie (browser) or `STRIDEIQ_API_KEY` + `STRIDEIQ_API_KEY_USER_ID`.

### Reasoning tools (deterministic)

| Tool                      | Purpose                     |
| ------------------------- | --------------------------- |
| `compare_sessions`        | Compare recent workouts     |
| `explain_readiness_delta` | Why readiness moved         |
| `find_best_phase`         | Strongest training phases   |
| `attribute_improvement`   | Patterns before gains       |
| `analyze_fade_pattern`    | Late-run pace fade          |
| `pr_context`              | Training before PRs         |
| `get_training_ecosystem`  | Multi-sport fatigue context |

Full tool catalog: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### MCP (Claude Desktop)

```bash
cd packages/strideiq-mcp && npm install && npm run build
```

Setup: [packages/strideiq-mcp/README.md](packages/strideiq-mcp/README.md).

---

## Development

### Project structure

```
app/                      # Next.js App Router (pages + API)
components/               # Feature UI (coach, plan, home, goals, …)
components/ui/            # shadcn/ui primitives
lib/
  strava/                 # Ingest + zod-validated normalized activities
  analytics/ insights/  # Metrics + narratives
  intelligence/         # Server bundle, tools, chat
  reasoning/            # Deterministic reasoning primitives
  training-calendar/    # Plan persistence & validation
hooks/                    # Data hooks for pages
db/migrations/            # Postgres schema
packages/strideiq-mcp/    # MCP server
backend/                  # FastAPI service (migration in progress; see backend/README.md)
contracts/openapi.json    # Generated backend API contract
lib/api-client/           # Generated TS types + BFF adapter for the backend
docs/                     # Architecture, deploy, smoke tests
```

**Rule:** UI consumes the normalized types from `lib/strava/types.ts` and view models — never raw Strava CSV rows.

### Scripts

| Command                 | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Development server                                         |
| `npm run dev:lan`       | Dev server on your LAN (reachable from other devices)      |
| `npm run lan`           | Print the LAN URL + Strava callback hint for device access |
| `npm run build`         | Production build                                           |
| `npm run start`         | Start production server                                    |
| `npm test`              | Vitest test suite                                          |
| `npm run check`         | Typecheck + lint + tests (CI gate)                         |
| `./scripts/verify.sh`   | Test + build gate                                          |
| `npm run backend:dev`   | FastAPI backend on `127.0.0.1:8000` (needs `uv`)           |
| `npm run backend:check` | Backend lint + typecheck + tests                           |
| `npm run api:generate`  | Regenerate OpenAPI + TS client from the backend            |
| `npm run api:check`     | Fail if the generated API contract is stale                |

### FIT import note

Strava CSV often references `activities/<id>.fit.gz` without bundling files. Upload the export folder first, then the `activities/` directory from your full archive. FIT streams are stored in IndexedDB and power route replay and stream intelligence.

### Webhooks

| Endpoint                                  | Purpose                        |
| ----------------------------------------- | ------------------------------ |
| `GET/POST /api/webhooks/strava`           | Verification + activity events |
| `GET/POST /api/webhooks/strava/subscribe` | Subscription management        |

Enable from **Settings** after OAuth is connected. Refresh the app after webhook events (no live push to the client yet). Note that this path is unit-tested but has never been exercised against a live Strava subscription — see [docs/DEPLOYMENT.md § Webhooks](docs/DEPLOYMENT.md#webhooks-optional-auto-sync).

---

## Documentation

| Document                                                                                   | Description                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------- |
| [docs/README.md](docs/README.md)                                                           | Documentation index                     |
| [PRODUCT.md](PRODUCT.md)                                                                   | Product contract and IA rules           |
| [docs/FEATURES.md](docs/FEATURES.md)                                                       | Complete feature catalog                |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md)                                                 | What is validated, and what is not      |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                               | Layers, data flow, API                  |
| [backend/README.md](backend/README.md)                                                     | Python backend setup and conventions    |
| [docs/COACH_AND_INTELLIGENCE.md](docs/COACH_AND_INTELLIGENCE.md)                           | Intelligence vs Coach                   |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                                                   | Vercel + Neon + Strava production setup |
| [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md)                                                   | Manual release checklist                |
| [docs/RELEASE_MVP.md](docs/RELEASE_MVP.md)                                                 | MVP scope and API requirements          |
| [docs/internal/DIFFERENTIATION_NORTH_STAR.md](docs/internal/DIFFERENTIATION_NORTH_STAR.md) | Future moat features                    |

---

## Tech stack

| Layer     | Technology                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- |
| Framework | Next.js 16, React 19, TypeScript                                                                |
| UI        | Tailwind CSS v4, shadcn/ui (Base UI), Recharts, MapLibre GL                                     |
| State     | Zustand                                                                                         |
| Data      | Papa Parse, fit-file-parser, Zod                                                                |
| Database  | Postgres — local Docker or Neon; driver auto-selected (`postgres` / `@neondatabase/serverless`) |
| LLM       | OpenAI / Anthropic (Coach, optional planning)                                                   |
| Testing   | Vitest                                                                                          |

---

## Known MVP limitations

- Unit preference is saved in Settings; chart labels remain km-centric until a future release.
- Saved training weeks live in browser `localStorage` (not synced per user to Neon).
- Coach and full intelligence bundle require server env and LLM keys.
- See [docs/RELEASE_MVP.md](docs/RELEASE_MVP.md) for the full list.

### What is validated, and what is not

Those are scope gaps. The more important question for a tool that predicts race times is which
of its numbers have been **checked against reality** — and the honest answer is: one race, and
the model was 7.5% out.

**[docs/LIMITATIONS.md](docs/LIMITATIONS.md)** sets that out in full: what has been backtested
and what hasn't, why the forecast intervals are honesty floors rather than calibrated bands,
the known result-matching defect in accuracy scoring, why marathon predictions are
extrapolation, and which integrations have never run against the live system they talk to.

Read it before trusting a number here. The distinction it keeps is between _implemented_,
_unit-tested_, _integration-tested_, _exercised against the real external system_, and _proven
in sustained use_ — 1,822 passing tests establish the second of those five, and nothing more.

---

## Troubleshooting

**Dev server uses huge amounts of memory / the machine swaps or crashes.**
Next.js/Turbopack picks the workspace root by walking _up_ for a lockfile. If a stray `package.json`/`package-lock.json` sits in a parent directory (e.g. your home folder), it can root there and watch your _entire_ home directory, exhausting memory. This repo pins the root via `turbopack.root` in [`next.config.ts`](next.config.ts); if you still hit it, remove the stray lockfile from the parent directory.

---

## License

[MIT](LICENSE) © Padraig O'Brien

---

<div align="center">

**[StrideIQ](https://github.com/Padraigobrien08/strideiq)** · Built for runners who want answers, not just activity logs.

</div>
