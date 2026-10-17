# StrideIQ documentation

| Document                                                                         | Audience           | Contents                                                    |
| -------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| [../README.md](../README.md)                                                     | Everyone           | Setup, routes, env, quick reference                         |
| [DEPLOYMENT.md](DEPLOYMENT.md)                                                   | Operators          | Vercel, Neon, Strava OAuth & webhook URLs                   |
| [SMOKE_TEST.md](SMOKE_TEST.md)                                                   | QA / release       | Manual MVP checklist (export + OAuth paths)                 |
| [RELEASE_MVP.md](RELEASE_MVP.md)                                                 | Everyone           | MVP scope, what needs API keys, tag notes                   |
| [FEATURES.md](FEATURES.md)                                                       | Everyone           | **Complete feature catalog** (every page, engine, tool)     |
| [LIMITATIONS.md](LIMITATIONS.md)                                                 | Everyone           | **What is validated and what is not** — evidence, not scope |
| [../PRODUCT.md](../PRODUCT.md)                                                   | Product / eng      | Positioning, IA rules, roadmap phases                       |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                               | Engineers          | Layers, data paths, API, folder map                         |
| [COACH_AND_INTELLIGENCE.md](COACH_AND_INTELLIGENCE.md)                           | Product + eng      | Athlete model vs conversational Coach                       |
| [ui-overhaul/README.md](ui-overhaul/README.md)                                   | Product + eng      | Approved UI overhaul contract and Claude Code handoff       |
| [internal/DIFFERENTIATION_NORTH_STAR.md](internal/DIFFERENTIATION_NORTH_STAR.md) | Strategy           | Moat features, reasoning primitives                         |
| [internal/MCP_AND_CHAT_PLAN.md](internal/MCP_AND_CHAT_PLAN.md)                   | Eng (historical)   | Early MCP/chat design notes                                 |
| [internal/ROADMAP_10_FEATURES.md](internal/ROADMAP_10_FEATURES.md)               | Product            | Feature backlog framing                                     |
| [internal/DEEP_ANALYSIS_ROADMAP.md](internal/DEEP_ANALYSIS_ROADMAP.md)           | Eng (aspirational) | Analysis ideas; names modules that do not exist yet         |
| [internal/MCP_STRAVA_ROADMAP.md](internal/MCP_STRAVA_ROADMAP.md)                 | Eng (aspirational) | Planned Strava tooling for the MCP package                  |
| [internal/BACKLOG.md](internal/BACKLOG.md)                                       | Eng (historical)   | Older backlog; paths in it may have been renamed since      |
| [../packages/strideiq-mcp/README.md](../packages/strideiq-mcp/README.md)         | Integrators        | MCP server setup                                            |

> **`internal/` is notes, not documentation.** Entries marked _historical_ or
> _aspirational_ describe what was planned or once existed; several name modules that were
> never built or have since been renamed. Nothing there should be read as a description of
> the current code — [ARCHITECTURE.md](ARCHITECTURE.md) and [FEATURES.md](FEATURES.md) are.

## Mental model

```
Strava data → domain model → analytics engines → insights + intelligence bundle
                                                      ↓
                              ┌───────────────────────┴───────────────────────┐
                              │                                               │
                       /intelligence (belief UI)                    /coach (investigation UI)
                              │                                               │
                              └───────────────────────┬───────────────────────┘
                                                      ↓
                                            LLM + tool loop (server)
```
