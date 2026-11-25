Live prototype: (add the deployed URL here)
Repository: (add the repository URL here)

# Sales Opportunity Triage

A small web app that helps a sales team decide which three inbound opportunities to work today, shows why, and makes every decision end in a concrete next action with an owner and a date.

## Who it is for

The buyer is the Head of Sales. They want sales time spent where it is most likely to move a qualified deal forward, and they want to be able to defend that choice.

The daily users are one sales manager, Jordan Lee, and two reps, Alex Rivera and Sam Patel. Between them they have capacity to work three opportunities today.

The workflow it replaces is a spreadsheet of inbound deals sorted by gut feel and deal size, plus call notes scattered across docs and chat. In that setup the biggest number tends to win attention, missing information stays invisible, and "follow up" is the most common next step.

The outcome I am aiming for is a defensible time allocation: each of today's three slots goes to a deal for a reason anyone on the team can read, and each touched deal leaves with a specific next action someone owns. Raw deal value matters, but it should not be the whole decision.

## How prioritization works

Ranking is a fixed, readable rule implemented in plain TypeScript. A language model never scores or ranks anything.

Step 1 is an eligibility gate. A deal is excluded from today's slots, whatever its value, if any of these is true:

- workflow fit is poor
- the prospect needs a workflow we do not support
- we have confirmed we have no access to the economic buyer

Step 2 gives every eligible deal a 0 to 100 priority score:

- Workflow fit, up to 40: strong 40, apparent 25, mixed 10.
- Verified readiness, up to 30: economic buyer confirmed 15, budget confirmed 15. Anything not confirmed earns 0.
- Buying timeline, up to 15: decision within 14 days 15, 15 to 30 days 10, 31 to 60 days 6, more than 60 days 2, unknown 0.
- Deal value, up to 15: $80k or more 15, $50k to $79,999 12, $30k to $49,999 8, under $30k 4.

When two deals have the same total, I break the tie in this order: higher fit points, then higher readiness points, then more timeline points, then the shorter known timeline, then the larger deal, then company name.

Step 3 fills the three slots. The top three eligible deals get "Work today". Other eligible deals get "Queue next". Gated deals get "Excluded today". The label comes from the slot a deal actually holds, so a deal ranked fourth never says "Work today".

The score is a way to allocate time today. It is not a forecast of whether a deal will close, and the app never presents it as one.

With the six sample deals the result is: Birch 74, Delta 73 and Fern 59 hold the slots; Cedar 37 and Elm 31 are queued; Alder ($120k) is excluded by the gate.

### Assumptions

- The three slots are shared team capacity for one day, not three per person.
- The app uses a fixed sample date of 2026-03-10 so the scenario is reproducible. Every "days to decision" is counted from that date.
- Facts the prospect has not stated stay unknown. The app never fills in a buyer, budget, date, name or job title on its own.
- An unknown budget and a budget the rep asked about but that is "not confirmed yet" both earn 0 readiness points. They are different facts, and the app lists them differently under missing information, but I do not want to punish a rep for asking and hearing "not yet".
- An unknown buying date earns 0 points, which is less than even a long timeline. That way discovering any date helps: if Cedar shares a 90-day timeline, its score goes from 37 to 39 instead of dropping.
- An unknown economic buyer is a discovery task, so the deal stays eligible. Confirmed "no access" to the buyer is different: it is a known blocker and it gates the deal.
- A qualified mid-size deal should beat a small deal with gaps. Once Cedar ($70k) confirms its economic buyer and a 21-day buying window, it scores 62 and takes the third slot from Fern ($18k, 59). That is the intended behavior: Fern is not wrong, it just has less verified readiness per hour of work.

### Trade-offs I chose

- Transparent weights plus a manager override, instead of a learned model. With six deals and no outcome history there is nothing to train on, and a sales team needs to argue with the rule. The manager can pin a deal into today's focus or defer one out of it, with a written reason. An override changes slot allocation only; the score shown never changes. Only the sales manager can set one, gated deals cannot be overridden, and there can be at most three pins.
- Browser storage per reviewer, instead of a shared database. Each reviewer gets their own copy of the sample data in localStorage, so nobody's edits leak into anyone else's review and there is no backend to run. The cost is that nothing is shared between people or devices. The stored data is versioned and validated on every load, and if the browser blocks storage the app says that changes are kept in memory only, instead of claiming they were saved.

## Reviewer walkthrough (Cedar)

Start from the seeded state. If you have used the app before, click "Reset seeded cases" first.

Manual path:

1. In the queue, select Cedar. It is #4 with 37 points under "Outside Today's Slots". The Observed Facts card shows the buyer and the decision date as unknown.
2. In "Record qualification change & next action", set Economic buyer to Confirmed, Buyer name to Maya Lin, Buyer title to VP of Operations, and Decision date to 2026-03-31 (21 days after the sample date). The preview line under the form shows the effect before you save.
3. Write a next action such as "Call Maya Lin Thursday about procurement timeline" and pick an owner. Leave the follow-up date empty and click Save. The save is refused, the follow-up date field is marked invalid, and focus moves to it.
4. Set the follow-up date to 2026-03-12 and save. The confirmation says Cedar is now #3 with 62 points and that Fern was displaced from today's three slots. Fern now sits at #4 as "Queue next".
5. Reload the page. Cedar is still in today's focus, and the change log shows who changed what, the rank and score before and after, and the next action that was saved.

Copilot path (optional, needs an Anthropic API key on the server):

1. Reset the seeded cases and select Cedar again.
2. Open "Optional: Extract draft from call note with Claude + LangGraph" and click "Sample: buyer confirmed, 21-day window".
3. Click "Extract draft with LangGraph". The preview lists the graph steps that ran, each verified change with the exact quote it came from, the fields left unchanged (for example "Budget status kept as unknown"), and the simulated movement, Cedar: #4, 37 pts → #3, 62 pts.
4. Click "Apply draft to form below". This only fills the form, including a drafted next action and follow-up date. Review every field, add the buyer title, and save as in the manual path.
5. Try "Sample: tricky note (negation & uncertainty)" too. Its hedged and negated statements should leave every field unchanged.

Without an API key the extract button returns a clear "not configured" message and the manual form keeps working.

Two more checks:

- Empty filters: set Workflow fit to Strong and Buying timeline to 31–60 days. The queue shows "No prospects match these filters" with a "Clear all filters" button.
- Comparison: "Compare Birch ($24k) vs. Alder ($120k)" opens a side-by-side view explaining why the bigger deal does not get a slot. Escape closes it and returns focus to the button.

## Proposed success metric

The metric I would track is Qualified Conversations per Sales Hour.

The numerator is the number of sales conversations in a week that end with at least one newly verified qualification fact (economic buyer, budget or decision date) and a saved, valid next action with an owner and a date. The denominator is the number of hours the manager and reps spent on inbound opportunity work that week, taken from their calendars.

Before rollout I would measure a three-week baseline from the existing spreadsheet and calendars, accepting that the old notes make the numerator approximate. After rollout the app would log an event for each saved qualification change (with which fields changed), each saved next action, each manager override and each applied copilot draft, so the numerator comes from logged events instead of memory.

The guardrail is weekly qualified pipeline value. If conversations per hour go up but the value of qualified pipeline falls below the baseline, the rule is steering people toward easy small deals and needs to be revisited.

I have not run this measurement, so I am not claiming any improvement.

## Deliberately out of scope

- Syncing with a CRM.
- Sending email or booking calendar events.
- Revenue forecasting.
- Machine-learned win-rate models.
- Real authentication and permissions. The role switcher in the header simulates who is signed in.

## Architecture

- src/domain holds the ranking engine, validation rules and change history. It is pure TypeScript with no framework or network code. It takes the sample date as an input instead of reading the clock, so the same facts always produce the same ranking.
- src/storage keeps the workspace in localStorage under one versioned key, validates it with zod when it loads, and feeds React through useSyncExternalStore so server rendering and hydration stay consistent.
- src/components is the Next.js interface: the queue with filters, the inspector cards, the comparison dialog and the copilot panel.
- src/ai is the optional call-note copilot.

### The call-note copilot

The copilot turns a messy call note into a draft for the manual form. It is a LangGraph graph with four steps and one loop, calling Claude through LangChain's Anthropic integration (the model comes from ANTHROPIC_MODEL, defaulting to claude-haiku-4-5):

1. extract_facts proposes only facts the note states as current, each with an exact quote from the note. Negated, hypothetical, hoped-for, questioned or third-party statements, and the rep's own task timings, are left out.
2. verify_entailment first removes any proposal whose quote is not literally in the note. It then asks the model whether each remaining quote really supports its value in context. If anything is rejected on the first pass, extraction runs once more with the rejection reasons.
3. simulate_impact applies the verified facts and reruns the same ranking engine to show how rank and score would move and who would lose a slot.
4. draft_action proposes a specific next action. The gap it should close is chosen in code, in a fixed order (eligibility, then buyer, then budget, then timeline), so the same facts always aim at the same gap; record-keeping gaps such as a missing job title are not sent to the model. The draft must be a step with the prospect, not an internal chore, and it must pass the same validation the form uses. If it fails either check, a plain template for that gap replaces it.

Each step is recorded with its status, a short summary and how long it took, and the panel shows that trace.

The endpoint is POST /api/extract-note. It validates the request strictly (known fields only, notes capped at 2,000 characters, bodies at 64 KB), rejects unknown prospects, and allows 15 requests per IP address every five minutes. If no ANTHROPIC_API_KEY is configured it returns 503 with the code LLM_UNAVAILABLE. There is deliberately no pattern-matching fallback, because keyword rules fail on negations and modal verbs.

The copilot never saves anything. Applying a draft only fills the form, and the rep still reviews and saves it.

### Adversarial eval

npm run eval:notes runs 12 deliberately hard call notes through the live graph and prints a pass/fail table. The cases cover a positive Cedar discovery call, explicit negation, negation written with a curly apostrophe, open questions, future and conditional statements, doubt about budget, a conditional timeline, a negated blocker, a rep's task duration mistaken for a buying window, a competitor's opinion, two people where only one is the decision maker, and an explicit "budget not confirmed" with a 14-day window.

Current result: 12 of 12 cases passed in each of two full runs against claude-sonnet-5-5, the model set in my .env.local. Two runs of a model that cannot be pinned to deterministic sampling are a small sample, so I treat this as "no failures seen yet", not as a guarantee.

In all 24 executions the extractor avoided the traps on its own and the verifier accepted every proposal on the first pass, so the retry loop never ran live. That loop, like the literal quote check and the action fallback, is covered by unit tests with scripted model responses. The default model, claude-haiku-4-5, has not been evaluated.

### How this was built: AI coding agent disclosure

I used an AI coding agent (Claude Code) heavily. It wrote most of the code: project scaffolding, the domain and storage modules, the React components and their wiring, the LangGraph graph and its prompts, the API route, the unit, component and end-to-end test suites, and the first draft of this README.

What came from me:

- The problem framing, the users, and the prioritization rule: the gate, the 40/30/15/15 weights, the cut-offs and the tie-break order.
- The constraints: keep observed facts separate from the derived evaluation, never invent missing fields, never let the model score or rank, require verbatim quotes, return a 503 instead of falling back to pattern matching, and protect the public endpoint.
- The validation rules for next actions and the requirement for written reasons.
- The interface requirements: labels on every control, visible keyboard focus, a native modal dialog, an accessible queue, and the persistence-failure warning.
- The UX fixes after I tested the app locally in the browser: overrides limited to the manager with a quick role switch, drafts that survive role switches, focus moved to invalid fields and to the save confirmation, the confirmation clearing when another deal is selected, and the inspector scrolling into view on phones.
- The 12 adversarial eval cases.

Some decisions were proposed by the agent and accepted by me, and I want them visible: how manager overrides interact with slots, scoring an already-passed decision date as 0, and dropping the temperature setting because the installed Anthropic SDK targets an API version that rejects it.

The agent also ran its own checks as it went: tests and builds after every change, browser runs against the production build, and deliberately breaking individual rules to confirm the tests caught it.

## Running it locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

The copilot is optional. To enable it, create .env.local with:

```bash
ANTHROPIC_API_KEY=your-key
# optional, defaults to claude-haiku-4-5
ANTHROPIC_MODEL=claude-haiku-4-5
```

### Automated checks

```bash
npm run lint        # ESLint
npm test            # unit and component tests (Vitest)
npm run build       # production build
npm run test:e2e    # browser tests against a production build (Playwright)
npm run eval:notes  # live copilot eval, needs a valid API key and costs API usage
```

The end-to-end tests start their own production server on port 3100 with the API key blanked, so they never call a model. One of them checks the real 503 message; another replaces /api/extract-note with a recorded response so the full copilot flow (sample note, preview, apply, save) runs deterministically and without token cost. The first run may need the browser downloaded with npx playwright install chromium.

### Manual checklist

1. The seeded queue shows Birch, Delta and Fern under "Today's Focus Allocation (3 Rep Slots)", and Alder as gated.
2. The Cedar walkthrough above ends with Cedar at #3 with 62 points, Fern at #4, and the change surviving a reload.
3. Saving with a blank follow-up date or a vague summary such as "follow up with them soon" is refused, with the field marked and focused.
4. As Alex or Sam, the override area is read-only and offers a switch to Jordan; switching keeps any text typed in the form.
5. Unconfirming a previously confirmed buyer or budget asks for a written reason.
6. With browser storage blocked, a change shows a warning that it is kept in memory only.
7. Without an API key, the copilot shows the "not configured" message and the manual form still works.
8. Every button, card and field shows a visible outline when reached with the keyboard.

## Known limitations

- Data lives in each browser's localStorage, so nothing is shared between people or devices.
- The sample date is fixed at 2026-03-10; the app does not use the real clock for scoring.
- The rate limit is kept in server memory, so on a serverless host it applies per instance and resets on cold starts.
- The check for vague next actions uses a list of generic words. A summary with one specific-looking word, such as "follow up with them pls", can still pass.
- The copilot does not extract job titles, so a confirmed buyer from a note still shows "title not recorded" until the rep adds it.
- The wording of the drafted next action varies between runs of the same note. The target gap is fixed in code, but the sentence is the model's, so reps should read it before saving.
- The role switcher is a simulation, not authentication.

## What remains untested

- The retry loop in a live run. It never triggered across 24 live executions, so its behavior with a real model is untested.
- The default model, claude-haiku-4-5. The eval and live checks ran on claude-sonnet-5-5.
- Browsers other than Chromium; the end-to-end suite runs in Chromium only.
- Real screen reader use. Labels, focus order and ARIA attributes are tested in code, not with assistive technology.
- A published deployment. I ran the full copilot flow through the interface against a local production build (next build and next start) with a real key, but not on the hosted site, so rate limiting across serverless instances is also untested.

## Next steps

1. Grow the eval with notes designed to slip past the extractor, so the verifier and retry loop are exercised live, and run it against claude-haiku-4-5 as well.
2. Add a shared backend with real sign-in so the team works from one queue and one change history.
3. Log the events the success metric needs and capture the three-week baseline before rollout.
4. Let the copilot extract buyer titles with the same quote and verification rules.
5. Replace the fixed sample date with the real date in the team's time zone.
