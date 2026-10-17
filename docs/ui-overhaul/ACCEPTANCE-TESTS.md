# Acceptance tests

These are outcome tests. Claude Code should convert them into automated tests where practical and use the remainder as explicit browser checks.

## Global navigation

### NAV-01 — Three primary destinations

**Given** the app shell is visible  
**Then** Today, Training and Progress are the only primary content destinations  
**And** Coach is presented as a persistent action.

### NAV-02 — Compatibility paths

**Given** a saved or external link targets `/plan`, `/runs`, `/intelligence`, `/goals` or `/performance`  
**When** it is opened during the migration  
**Then** it resolves to valid content or an intentional compatibility redirect.

### NAV-03 — Contextual Coach

**Given** a runner opens Coach from a primary screen  
**Then** Coach identifies the source page and relevant entity without asking the runner to repeat it.

## Today

### TODAY-01 — Daily answer

**Given** a planned run exists for today  
**When** Today opens at 1440 × 900  
**Then** session type, distance, duration and target pace are visible without scrolling.

### TODAY-02 — Explanation

**Given** a planned run exists  
**Then** Today states why it was chosen and how it supports the race goal.

### TODAY-03 — Rest prescription

**Given** today is a planned rest day  
**Then** Today shows recovery guidance for mobility, sleep or fueling  
**And** does not render an empty workout card.

### TODAY-04 — Readiness exception

**Given** readiness does not materially change the session  
**Then** no readiness panel occupies the primary layout.

**Given** readiness does materially change the session  
**Then** a warning states the evidence, consequence and recommended action.

### TODAY-05 — No race

**Given** no active race goal exists  
**Then** recent progress replaces the race countdown  
**And** general training remains usable.

### TODAY-06 — Coach handoff

**When** the runner selects Ask about this run  
**Then** the full Coach page opens with the session attached.

## Training

### TRAIN-01 — Current week default

**When** Training opens  
**Then** the current week is selected and Today is clearly identified.

### TRAIN-02 — Selected-day synchronization

**When** the runner selects a day  
**Then** the detail region shows only that day's session and state.

### TRAIN-03 — Completed comparison

**Given** a planned session is matched to a completed run  
**Then** distance, pace/effort and duration show planned-versus-actual values  
**And** the full activity remains reachable.

### TRAIN-04 — Upcoming prescription

**Given** a future session is selected  
**Then** its prescription, structure, purpose and target effort are visible  
**And** no unrelated completed comparison is shown.

### TRAIN-05 — Plan generation safety

**When** a generated plan preview exists  
**Then** it does not replace the saved week until the existing save/replace confirmation succeeds.

### TRAIN-06 — Mobile week strip

**Given** a 390 px viewport  
**Then** the week strip scrolls intentionally  
**And** the overall page has no horizontal overflow.

## Progress

### PROGRESS-01 — Direct status

**Given** sufficient forecast evidence exists  
**Then** the page displays exactly one of Ahead, On track or At risk before technical detail.

### PROGRESS-02 — Honest insufficiency

**Given** forecast evidence is insufficient  
**Then** Progress displays Not enough evidence  
**And** does not display a precise estimate  
**And** explains what would establish a useful baseline.

### PROGRESS-03 — Projection range

**Given** a projection is shown  
**Then** it includes a range, confidence, last-updated value and provenance.

### PROGRESS-04 — Computed ownership

**Then** status, range and confidence originate from deterministic analytics/view-model output  
**And** no LLM response can overwrite those fields.

### PROGRESS-05 — Evidence trace

**When** the runner selects View evidence  
**Then** each signal shows source/date and whether it strengthened or weakened the assessment.

### PROGRESS-06 — Deep methodology

**When** the runner opens Projection details  
**Then** model inputs, assumptions, limitations and confidence rationale are inspectable.

### PROGRESS-07 — Adaptive depth

**Given** strong healthy evidence  
**Then** the overview remains concise.

**Given** uncertainty or At risk  
**Then** conflicting/missing evidence and one concrete adjustment become visible.

### PROGRESS-08 — No race

**Given** no race goal exists  
**Then** Progress defaults to the most recent 12 weeks and answers whether fitness is improving.

## Coach and proposals

### COACH-01 — Context visibility

**Given** Coach opened from Today, Training, an activity or Progress  
**Then** the source context is visible or expandable throughout the conversation.

### COACH-02 — Contextual history

**Given** a conversation concerns a workout, week or progress assessment  
**Then** reopening that entity can recover the associated conversation  
**And** starting fresh does not corrupt prior confirmed data.

### COACH-03 — Structured proposal

**Given** Coach recommends a plan change  
**Then** the proposal contains typed original and proposed values, rationale and downstream impact  
**And** is not recovered by parsing displayed prose.

### COACH-04 — No conversational mutation

**Given** Coach has generated a proposal  
**When** the runner continues chatting, closes Coach or chooses Keep current plan  
**Then** the confirmed training calendar remains byte-for-byte unchanged.

### COACH-05 — Explicit update boundary

**Given** a valid proposal is visible  
**When** the runner selects Update plan  
**Then** validation runs, history is snapshotted and the confirmed week updates exactly once.

### COACH-06 — Editable proposal

**When** the runner changes day, distance, duration or target effort directly  
**Then** weekly totals and downstream effects recalculate before approval.

### COACH-07 — Stale proposal

**Given** the source week changes after a proposal is created  
**Then** the proposal is marked stale and cannot be applied without regeneration or renewed review.

### COACH-08 — Failure isolation

**Given** Coach or proposal generation fails  
**Then** the confirmed plan and computed analytics remain unchanged  
**And** the runner receives an inline recovery action.

## Accessibility and quality

### A11Y-01 — Keyboard access

**Then** navigation, week selection, evidence disclosure, proposal editing and final actions are keyboard operable with visible focus.

### A11Y-02 — Status semantics

**Then** status is never communicated by colour alone.

### A11Y-03 — Chart alternative

**Then** the projection chart has an accessible text summary and data representation.

### A11Y-04 — Responsive reflow

**Then** split layouts stack in decision order on mobile and no critical action is obscured by sticky UI.

### REG-01 — Existing workflows

**Then** import, Strava sync, demo mode, settings, run detail, route replay and current plan generation remain functional.

### REG-02 — Repository verification

**Then** `npm run check` and `npm run build` pass, excluding only failures documented before implementation began.
