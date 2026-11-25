# Sales Opportunity Triage — Spec

## Problem

A sales manager (Jordan Lee) and two reps (Alex Rivera, Sam Patel) can work **3**
inbound opportunities today. The tool ranks the open prospects, fills the 3
focus slots, and shows why each prospect landed where it did.

The output is a **prioritization score for allocating today's time**. It is not a
forecast of whether a deal closes, and the UI and code must never present it as one.

## Two layers, kept separate

| Layer | Type | What it holds |
| --- | --- | --- |
| Observed facts | `ProspectFacts` | Only what a rep heard or recorded. Anything unstated stays `unknown` / `null`. No invented names, titles, budgets or dates. |
| Derived evaluation | `PriorityEvaluation` | Gate result, score breakdown, rank, stance, missing info, scope risks. Recomputed from facts + reference date; never written back into facts. |

The engine (`src/domain/triageEngine.ts`) is a pure function:
`triage(facts[], { asOf, focusSlots = 3 })`. The reference date is always
injected; the engine never reads the clock.

## 1. Eligibility gate (runs first)

A prospect is **excluded** from today's focus slots, regardless of ACV, if any of:

- `workflowFit === "poor"`
- a stated requirement has `support === "unsupported"`
- `economicBuyer.status === "no_access"` (confirmed we cannot reach the buyer)

All matching reasons are recorded. An **unknown** buyer is not a gate reason; it
is a discovery task. Gated prospects get `priorityScore: null`, rank after every
eligible prospect (by company name), and never backfill an empty slot.

## 2. Priority score (0–100, eligible prospects only)

| Component | Max | Points |
| --- | --- | --- |
| Workflow fit | 40 | strong 40 · apparent 25 · mixed 10 |
| Verified readiness | 30 | buyer confirmed 15 (unknown 0) + budget confirmed 15 (unknown 0, not_confirmed 0) |
| Buying timeline | 15 | ≤14d 15 · 15–30d 10 · 31–60d 6 · >60d 2 · unknown 0 |
| Deal value (ACV) | 15 | ≥$80k 15 · $50k–79,999 12 · $30k–49,999 8 · <$30k 4 |

- `not_confirmed` budget scores the same as `unknown` (we don't penalize a rep for
  asking and hearing "not yet"), but produces different missing-info text.
- Unknown timeline scores 0, below even >60d, so discovering any date raises the score.
- Days to decision = calendar days from the reference date to the stated decision date (UTC).

**Tie-break** (when totals are equal): fit points → readiness points → timeline
points → shorter known timeline (unknown last) → higher raw ACV → company name
(code-point order) → id.

## 3. Stance

Derived from the slot actually assigned, never from the score alone:

- `work_today` — holds one of today's focus slots
- `queue_next` — eligible but outside the slots (a #4 prospect never says "work today")
- `excluded` — failed the gate

## 4. Inspection output

- `missingInfo` — unknown buyer, buyer confirmed but name/title not recorded,
  budget unknown vs. asked-but-not-confirmed, unknown or stale decision date.
- `scopeRisks` — non-blocking friction such as requirements with
  `support === "custom_work"` (e.g. Elm's custom integration).

## 5. Validation (`src/domain/validation.ts`)

**Next action**

- `summary`: trimmed, ≥12 characters, ≥3 distinct words, and must contain at least
  one specific word (a name, topic, artifact…). Vague placeholders made only of
  generic verbs/pronouns/time words ("follow up", "follow up with them soon",
  "call them", "send email", "check in") are rejected; "Call Maya Lin Thursday
  about procurement timeline" passes. This is a syntactic heuristic, not language
  understanding.
- `ownerId`: one of Jordan Lee (manager), Alex Rivera (rep), Sam Patel (rep).
- `followUpDate`: a real `YYYY-MM-DD` calendar date on or after the reference date.

**Reasons required**

- Changing a previously **confirmed** buyer or budget to anything else.
- Setting a manager override.

A reason is ≥10 trimmed characters and ≥2 words.

## Seed data (reference date 2026-03-10)

| Prospect | ACV | Facts | Expected |
| --- | --- | --- | --- |
| Birch | $24,000 | strong fit, buyer confirmed, decide within 14d | #1, 74, work today |
| Delta | $45,000 | strong fit, budget confirmed, 30d | #2, 73, work today |
| Fern | $18,000 | strong fit, budget not confirmed, 14d | #3, 59, work today |
| Cedar | $70,000 | apparent fit, buyer + date unknown | #4, 37, queue next |
| Elm | $90,000 | mixed fit, custom integration (scope risk), 60d | #5, 31, queue next |
| Alder | $120,000 | poor fit, unsupported regulated workflow, 180d | #6, gated, excluded |

If Cedar's buyer is confirmed with a 21-day decision date, Cedar scores 62 and
takes #3; Fern drops to #4 / `queue_next`.

## Decisions made while building

- A stated decision date already in the past scores 0 timeline points, is treated as
  unknown for tie-breaks, and is flagged in `missingInfo` for reconfirmation.
- Fewer eligible prospects than slots leaves slots empty; gated deals never fill them.

## Open questions (not built yet)

- How a manager override affects slotting (pin into / force out of focus), and
  whether only the manager may set one. Today only the reason requirement exists.
- Persisting fact-change history (who changed what, with which reason).
