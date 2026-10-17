# Claude Code architecture migration prompt

```text
We are adding an incremental Python backend migration to the approved StrideIQ UI overhaul.

Confirm the current branch and worktree state. Then read, completely and in order:

1. AGENTS.md
2. docs/ARCHITECTURE.md
3. docs/COACH_AND_INTELLIGENCE.md
4. docs/ui-overhaul/README.md
5. docs/ui-overhaul/DECISIONS.md
6. docs/ui-overhaul/ARCHITECTURE-MIGRATION.md
7. docs/ui-overhaul/IMPLEMENTATION-PLAN.md
8. docs/ui-overhaul/ACCEPTANCE-TESTS.md

Approved architecture:

- Next.js remains the React frontend.
- Next.js provides a thin same-origin BFF.
- Python/FastAPI becomes the backend.
- Migration is milestone-based, never a big-bang rewrite.
- FastAPI/Pydantic owns transport schemas and OpenAPI.
- OpenAPI generates the committed TypeScript client and types.
- CI must detect stale generated output and contract drift.
- Existing TypeScript capabilities remain active until Python parity passes.
- Do not merge Intelligence into Coach.
- Deterministic services calculate numbers; LLMs explain and propose.
- Update plan remains the only Coach-proposal mutation boundary.

Implement Milestone A only from ARCHITECTURE-MIGRATION.md.

Before writing code:

1. Inventory current Next API routes, authentication, database access, Strava integrations,
   analytics entry points and Coach streaming behavior.
2. Propose the exact backend directory layout and minimal dependencies.
3. Decide and document the local service URL, BFF error envelope, request timeout defaults,
   OpenAPI generation command and generated-client location.
4. Create an ADR for service-to-service authentication. If production identity details are
   genuinely unknowable from the repository, implement only a safe local-development path
   and leave production traffic disabled rather than inventing insecure auth.
5. Record baseline results for npm run check and npm run build.

Milestone A deliverables:

- Minimal FastAPI app under backend/ with typed configuration.
- Health and readiness endpoints.
- Python lint/type/test tooling with documented commands.
- OpenAPI export.
- Generated lightweight TypeScript client and reproducible npm commands.
- A thin Next BFF health endpoint proving server-to-server connectivity.
- Consistent timeout, correlation ID and error-envelope behavior.
- Tests for FastAPI health, contract generation and BFF error handling.
- CI integration that adds checks without removing existing ones.
- Updated architecture and local-development documentation.

Do not migrate analytics, database access, Strava, planning or Coach behavior in this
milestone. Do not change the approved UI. Do not add production traffic routing yet.

Run the relevant Python and TypeScript checks. Stop after Milestone A and report:

1. Files changed
2. Dependencies added and why
3. Commands run and results
4. The generated-contract workflow
5. Security assumptions and unresolved production decisions
6. Evidence that no user capability was moved
7. Recommended first analytics pilot for Milestone B, with rationale
```
