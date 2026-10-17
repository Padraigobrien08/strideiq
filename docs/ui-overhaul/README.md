# StrideIQ UI overhaul handoff

This folder is the approved product and implementation contract for the StrideIQ UI overhaul.

## Reading order for Claude Code

1. Repository-root `AGENTS.md`
2. [`SPEC.md`](./SPEC.md)
3. [`DECISIONS.md`](./DECISIONS.md)
4. [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)
5. [`ACCEPTANCE-TESTS.md`](./ACCEPTANCE-TESTS.md)
6. [`CLAUDE-HANDOFF.md`](./CLAUDE-HANDOFF.md)

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
