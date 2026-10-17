# StrideIQ UI overhaul handoff

This folder is the approved product and implementation contract for the StrideIQ UI overhaul.

## Reading order for Claude Code

1. Repository-root `AGENTS.md`
2. [`SPEC.md`](./SPEC.md)
3. [`DECISIONS.md`](./DECISIONS.md)
4. [`ARCHITECTURE-MIGRATION.md`](./ARCHITECTURE-MIGRATION.md)
5. [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)
6. [`ACCEPTANCE-TESTS.md`](./ACCEPTANCE-TESTS.md)
7. [`CLAUDE-HANDOFF.md`](./CLAUDE-HANDOFF.md)
8. [`CLAUDE-ARCHITECTURE-PROMPT.md`](./CLAUDE-ARCHITECTURE-PROMPT.md)
9. [`MILESTONE-A.md`](./MILESTONE-A.md) — record of the backend foundation milestone

The mockups under [`mockups/`](./mockups/) are approved references for hierarchy, composition and visual tone. They are not literal screenshots to reproduce blindly. Real content, responsive behavior, accessibility and existing application contracts take precedence over incidental image details.

## Contract priority

When instructions conflict, use this order:

1. Safety, security and repository-root agent instructions
2. Existing domain and analytics contracts
3. `DECISIONS.md`
4. `SPEC.md`
5. Mockup imagery

Do not merge the Intelligence data model into Coach. The new **Progress** surface is the runner-facing read-first view over existing goal, forecast and intelligence data. Coach remains conversational and tool-grounded.

## Approved outcome

- Primary navigation: **Today / Training / Progress**
- Persistent contextual action: **Ask Coach**
- Desktop-led, mobile-complete experience
- Computed analytics remain separate from LLM explanation
- Conversation can propose but cannot silently mutate a plan
- Every plan mutation requires structured review and explicit approval
- Next.js remains the React frontend; FastAPI becomes the backend through a thin BFF
- API types and the TypeScript client are generated from FastAPI OpenAPI
- Backend extraction proceeds milestone by milestone with parity gates
