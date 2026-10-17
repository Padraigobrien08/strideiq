# Approved decisions

These decisions were established through product questioning and approved visual references. Do not reopen them during implementation unless the codebase proves a decision technically unsafe or internally contradictory.

## Information architecture

| User-facing destination | Canonical route | Purpose                                                        |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| Today                   | `/home`         | Daily training or recovery prescription                        |
| Training                | `/training`     | Current week, selected-day detail and activity history         |
| Progress                | `/progress`     | Race status, projection, evidence and deeper progress signals  |
| Coach                   | `/coach`        | Contextual investigation, explanation and structured proposals |

### Compatibility routes

- `/plan` remains functional during migration and ultimately redirects to or renders the Training week view.
- `/runs` and `/runs/[id]` remain valid deep links from Training.
- `/intelligence` remains the deeper read-first belief/evidence surface reachable from Progress.
- `/goals` and `/performance` remain functional drill-ins until their responsibilities are safely consolidated.
- Do not delete or mass-redirect deep routes in the first implementation phase.

## Today

- The first question is “What should I do today?”
- Primary order: session type → distance → duration → target pace → why today → race relevance.
- Primary contextual action: **Ask about this run**.
- **View this week** is secondary.
- Race countdown is the secondary desktop column.
- Without a race, show recent progress instead.
- Readiness appears only when it changes the recommendation.
- A rest day shows recovery guidance for mobility, sleep and fueling.
- Desktop composition is approximately 65/35.

## Training

- Default view is the current week.
- Use a compact seven-day strip with selected-day detail below.
- Day cells show session type, distance/duration and status.
- Pace belongs in selected-day detail, not every narrow cell.
- Completed sessions show planned versus actual.
- The detail region always matches the selected day.
- Mobile uses a horizontally scrollable week strip, not seven compressed columns.

## Progress

- Primary question: “Am I on track for my race goal?”
- Status vocabulary: **Ahead / On track / At risk / Not enough evidence**.
- Default chart: race projection over time.
- Projection shows a range and confidence, never false precision.
- With a race: current training block. Without a race: most recent 12 weeks.
- Healthy state is concise; uncertain and at-risk states reveal more explanation.
- Evidence has two levels: inline summary and dedicated projection detail.
- At risk produces one concrete adjustment, not a generic list.
- Primary action: **Discuss with Coach**. Secondary: **Review proposed change**.
- Progress remains computed/read-first; Coach remains conversational.

## Coach and plan mutation

- Coach is globally available and receives page context.
- Simple context uses an expandable banner; plan/projection work uses a side panel.
- History is contextual to a workout, week or progress assessment.
- Proposed changes are structured application data, not prose parsed from a message.
- Users can edit proposals through direct controls or ask Coach to revise them.
- Proposal review shows the changed session and downstream effects on volume, intensity and race preparation.
- No plan changes until the runner selects **Update plan**.
- **Keep current plan** leaves the confirmed plan untouched.

## Visual direction

- Hybrid: calm coaching on Today, structured planning on Training, technical depth on Progress.
- Desktop-led, mobile-complete.
- Warm off-white base, charcoal text, muted orange accent and soft sage positive state.
- Top navigation; no permanent dashboard sidebar.
- Generous whitespace, strong typography and minimal card chrome.
- No decorative AI gradients, glass effects or dense equal-weight card grids.

## Non-negotiable technical boundaries

- Numbers come from existing analytics/reasoning/tools, never from LLM invention.
- Normalized Strava domain types remain the UI data source; never expose raw CSV rows.
- Running performance drives race prediction; other modalities affect context and fatigue.
- Coach failures cannot affect confirmed plans or analytics.
- Preserve the viewport-locked Coach layout rule unless the replacement has equivalent tested behavior.
- Do not migrate the framework or styling system.

## Backend architecture

- Next.js remains the React frontend.
- The browser calls same-origin Next BFF routes; it does not call FastAPI directly.
- FastAPI becomes the owner of domain logic, analytics, persistence, integrations and AI orchestration.
- Migration proceeds by milestones with TypeScript/Python parity gates.
- FastAPI/Pydantic owns transport schemas and OpenAPI.
- The TypeScript client and API types are generated and checked for drift in CI.
- Do not dual-write or move a capability before rollback and parity behavior are defined.
