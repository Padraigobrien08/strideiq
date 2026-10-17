# Claude Code handoff

## Initial audit prompt

Use this prompt for the first Claude Code session on the overhaul branch:

```text
Read repository-root AGENTS.md, then read every file under docs/ui-overhaul in this order:
README.md, SPEC.md, DECISIONS.md, IMPLEMENTATION-PLAN.md, ACCEPTANCE-TESTS.md.

Do not change application code yet.

Audit the current repository against the approved overhaul and report:
1. The exact existing components, hooks and view models that can be retained for each phase.
2. Any conflict between the spec and current domain/analytics contracts.
3. Whether every required state can be produced from real data today.
4. The migration path for /home, /training, /progress, /plan, /runs, /goals,
   /performance, /intelligence and /coach.
5. The exact typed contract required for contextual Coach threads and plan proposals.
6. Baseline results for npm run check and npm run build.

Update docs/ui-overhaul/IMPLEMENTATION-PLAN.md only if repository evidence requires a
more precise file map or dependency order. Do not weaken approved decisions silently.
Flag any unavoidable decision change for human review.
```

## Phase execution prompt

After the audit is reviewed, use this for each phase:

```text
Implement Phase <N> from docs/ui-overhaul/IMPLEMENTATION-PLAN.md only.

Follow AGENTS.md, SPEC.md, DECISIONS.md and ACCEPTANCE-TESTS.md. Work within the
existing Next.js, React and Tailwind stack. Reuse current analytics, normalized data,
calendar validation and Coach tooling. Do not rewrite working domain logic merely to
match a mockup.

Before coding, list the exact acceptance tests covered by this phase. After coding:
- run the targeted tests;
- run npm run typecheck and npm run lint;
- visually verify relevant desktop and mobile states;
- report changed files, verification results, deviations and remaining risks;
- stop before the next phase.
```

## Final verification prompt

```text
Audit the completed overhaul against every item in docs/ui-overhaul/ACCEPTANCE-TESTS.md.
Do not infer success from code presence. Verify the observable user outcome.

Run npm run check and npm run build. Inspect all primary screens at desktop and mobile
widths, including loading, empty, partial-data, error and stale-data states. Confirm that:
- displayed projections come from deterministic analytics;
- Intelligence remains read-first and distinct from Coach;
- generated Coach proposals do not mutate the plan;
- Update plan is the only proposal mutation boundary;
- old deep links remain valid or intentionally redirected.

Produce a short pass/fail table with evidence and exact file references for failures.
```

## Guardrails for Claude

- The mockups are hierarchy references, not permission to hardcode sample data.
- Do not replace real algorithms with the example numbers shown in images.
- Do not collapse Intelligence into Coach.
- Do not expose raw Strava CSV data in UI components.
- Do not let the LLM calculate or overwrite race status, projection or confidence.
- Do not parse plan mutations from assistant prose.
- Do not save generated or edited plans until explicit user approval.
- Do not delete compatibility routes in early phases.
- Do not add a dependency when an existing component or browser primitive is adequate.
- Preserve unrelated functionality and user changes.
