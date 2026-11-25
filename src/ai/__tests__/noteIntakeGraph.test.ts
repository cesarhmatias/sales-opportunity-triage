import { describe, expect, it } from "vitest";
import { extractNoteResponseSchema } from "../noteIntakeContract";
import { runNoteIntake } from "../noteIntakeGraph";
import { isLiteralQuote, literalCheck } from "../notePatch";
import { ScriptedLLM, extraction, requestFor, verdicts } from "./scriptedLLM";

// Note uses a curly apostrophe ("she’s") and a line break on purpose; quotes below use plain text.
const CEDAR_NOTE = `Call with Cedar today. Spoke with Dana Ortiz, their VP Operations; she confirmed she’s the economic buyer and signs off on this.
They plan to decide within three weeks. Budget hasn't been confirmed yet. Need to learn whether procurement needs a security review. I'll send the pricing deck in 2 days.`;

const cedarDraft = { summary: "Call Dana Ortiz Thursday about Cedar's budget approval steps", followUpInDays: 2 };

const nodes = (trace: { node: string; status: string }[]) => trace.map((t) => `${t.node}:${t.status}`);

describe("note intake graph: happy path (Cedar)", () => {
  it("verifies quoted facts, simulates the queue with the pure engine, and drafts a valid action", async () => {
    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          buyerStatus: { value: "confirmed", quote: "she confirmed she's the economic buyer" },
          buyerName: { value: "Dana Ortiz", quote: "Spoke with Dana Ortiz, their VP Operations; she confirmed she's the economic buyer" },
          timelineDays: { value: 21, quote: "They plan to decide within three weeks" },
          budgetStatus: { value: "not_confirmed", quote: "Budget hasn't been confirmed yet" },
        }),
      ],
      verify_entailment: [
        verdicts(["buyerStatus", true], ["buyerName", true], ["budgetStatus", true], ["timelineDays", true]),
      ],
      draft_action: [cedarDraft],
    });

    const result = await runNoteIntake(requestFor("cedar", CEDAR_NOTE), { llm });

    expect(extractNoteResponseSchema.parse(result)).toEqual(result);
    expect(result.attempts).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(result.verified.map((v) => v.field)).toEqual(["buyerStatus", "buyerName", "budgetStatus", "timelineDays"]);
    expect(result.draftPatch).toEqual({
      buyerStatus: "confirmed",
      buyerName: "Dana Ortiz",
      budget: "not_confirmed",
      targetDecisionDate: "2026-03-31",
    });
    // Score and rank come from triageEngine, not the model: Cedar 37 → 62 takes Fern's slot.
    expect(result.impact).toEqual({
      company: "Cedar",
      before: { rank: 4, score: 37, stance: "queue_next" },
      after: { rank: 3, score: 62, stance: "work_today" },
      displaced: ["Fern"],
      missingInfoAfter: ["Economic buyer confirmed, but name/title not recorded", "Budget asked about, not yet confirmed"],
      gateReasonsAfter: [],
    });
    expect(result.nextAction).toEqual({
      action: { summary: cedarDraft.summary, ownerId: "alex-rivera", followUpDate: "2026-03-12" },
      source: "model",
      modelDraftErrors: [],
    });
    expect(nodes(result.nodeTrace)).toEqual([
      "extract_facts:ok",
      "verify_entailment:ok",
      "simulate_impact:ok",
      "draft_action:ok",
    ]);
    expect(result.nodeTrace.every((t) => t.durationMs >= 0 && t.summary.length > 0)).toBe(true);
    // The note is passed as delimited data, and the remaining gaps reach the drafter.
    expect(llm.callsTo("extract_facts")[0].user).toContain(`<call_note>\n${CEDAR_NOTE}\n</call_note>`);
    expect(llm.callsTo("draft_action")[0].user).toContain("Budget asked about, not yet confirmed");
  });
});

describe("note intake graph: literal quote check", () => {
  it("strips a proposal whose quote isn't in the note before the entailment model sees it", async () => {
    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          timelineDays: { value: 21, quote: "decision expected in 3 weeks" }, // fabricated quote
          budgetStatus: { value: "not_confirmed", quote: "Budget hasn't   been\nconfirmed yet" }, // whitespace differs: still literal
        }),
        extraction({ budgetStatus: { value: "not_confirmed", quote: "Budget hasn't been confirmed yet" } }),
      ],
      verify_entailment: [verdicts(["budgetStatus", true]), verdicts(["budgetStatus", true])],
      draft_action: [cedarDraft],
    });

    const result = await runNoteIntake(requestFor("cedar", CEDAR_NOTE), { llm });

    const firstVerification = llm.callsTo("verify_entailment")[0].user;
    expect(firstVerification).toContain("field=budgetStatus");
    expect(firstVerification).not.toContain("timelineDays");
    expect(result.rejected).toEqual([
      {
        field: "timelineDays",
        value: 21,
        quote: "decision expected in 3 weeks",
        stage: "literal",
        reason: "Quote is not a literal excerpt of the call note.",
        attempt: 1,
      },
    ]);
    expect(result.verified.map((v) => v.field)).toEqual(["budgetStatus"]);
    expect(result.draftPatch).toEqual({ budget: "not_confirmed" });
    expect(result.draftPatch.targetDecisionDate).toBeUndefined();
  });

  it("normalizes whitespace and apostrophes but stays literal and case-sensitive", () => {
    expect(isLiteralQuote(CEDAR_NOTE, "she confirmed she's the economic buyer")).toBe(true);
    expect(isLiteralQuote(CEDAR_NOTE, "signs off on this. They plan")).toBe(true); // spans the line break
    expect(isLiteralQuote(CEDAR_NOTE, "SHE CONFIRMED she's the economic buyer")).toBe(false);
    expect(isLiteralQuote(CEDAR_NOTE, "   ")).toBe(false);
  });

  it("rejects a buyer name that isn't in its own quote (no names inferred from roles)", () => {
    const note = "Their COO confirmed she signs off on new tooling.";
    expect(literalCheck(note, { field: "buyerName", value: "Maya Lin", quote: "Their COO confirmed she signs off" })).toMatch(
      /does not appear verbatim/,
    );
    expect(literalCheck(note, { field: "timelineDays", value: 2.5, quote: "Their COO" })).toMatch(/whole number/);
    expect(literalCheck(note, { field: "hasUnsupportedBlocker", value: false, quote: "Their COO" })).toMatch(/newly stated/);
  });
});

describe("note intake graph: conditional retry", () => {
  const NOTE =
    "Maya Lin from IT joined the call. Their COO confirmed they sign off on new tooling. Budget isn't confirmed; they'll know after the board meets.";

  it("routes back to extract_facts once with the critique when verification rejects a field", async () => {
    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          buyerStatus: { value: "confirmed", quote: "Their COO confirmed they sign off on new tooling" },
          buyerName: { value: "Maya Lin", quote: "Maya Lin from IT joined the call" },
        }),
        extraction({ buyerStatus: { value: "confirmed", quote: "Their COO confirmed they sign off on new tooling" } }),
      ],
      verify_entailment: [
        verdicts(
          ["buyerStatus", true],
          ["buyerName", false, "Maya Lin is an IT attendee; the confirmed buyer is the unnamed COO."],
        ),
        verdicts(["buyerStatus", true]),
      ],
      draft_action: [{ summary: "Ask Maya Lin to introduce us to the COO about budget timing", followUpInDays: 3 }],
    });

    const result = await runNoteIntake(requestFor("cedar", NOTE), { llm });

    expect(llm.callsTo("extract_facts")).toHaveLength(2);
    const retryPrompt = llm.callsTo("extract_facts")[1].user;
    expect(retryPrompt).toContain("previous proposals were rejected");
    expect(retryPrompt).toContain('buyerName="Maya Lin"');
    expect(retryPrompt).toContain("the confirmed buyer is the unnamed COO");

    expect(result.attempts).toBe(2);
    expect(nodes(result.nodeTrace)).toEqual([
      "extract_facts:ok",
      "verify_entailment:rejected",
      "extract_facts:ok",
      "verify_entailment:ok",
      "simulate_impact:ok",
      "draft_action:ok",
    ]);
    expect(result.verified.map((v) => v.field)).toEqual(["buyerStatus"]);
    expect(result.rejected).toMatchObject([{ field: "buyerName", stage: "entailment", attempt: 1 }]);
    expect(result.draftPatch).toEqual({ buyerStatus: "confirmed" });
    expect(result.impact.after.score).toBe(52); // apparent 25 + buyer 15 + no timeline 0 + $70k 12
  });

  it("retries at most once, then proceeds with whatever verified", async () => {
    const negated = extraction({ budgetStatus: { value: "confirmed", quote: "Budget isn't confirmed" } });
    const llm = new ScriptedLLM({
      extract_facts: [negated, negated],
      verify_entailment: [
        verdicts(["budgetStatus", false, "The quote negates it."]),
        verdicts(["budgetStatus", false, "The quote negates it."]),
      ],
      draft_action: [{ summary: "Confirm Cedar's budget approval date with the COO", followUpInDays: 4 }],
    });

    const result = await runNoteIntake(requestFor("cedar", NOTE), { llm });

    expect(llm.callsTo("extract_facts")).toHaveLength(2);
    expect(result.verified).toEqual([]);
    expect(result.rejected.map((r) => r.attempt)).toEqual([1, 2]);
    expect(result.impact.before).toEqual(result.impact.after);
    expect(nodes(result.nodeTrace).slice(-2)).toEqual(["simulate_impact:ok", "draft_action:ok"]);
  });
});

describe("note intake graph: next-action drafting", () => {
  it("replaces a vague model draft with a validated gap template", async () => {
    const llm = new ScriptedLLM({
      extract_facts: [extraction({})],
      draft_action: [{ summary: "follow up with them soon", followUpInDays: 30 }],
    });

    const result = await runNoteIntake(requestFor("cedar", "Quick intro call, nothing concrete yet."), { llm });

    expect(llm.callsTo("verify_entailment")).toHaveLength(0); // nothing to verify
    expect(result.nextAction.source).toBe("template");
    expect(result.nextAction.modelDraftErrors[0]).toMatch(/too vague/);
    expect(result.nextAction.action).toEqual({
      summary: "Ask Cedar who signs off on this purchase and book an economic buyer call",
      ownerId: "alex-rivera",
      followUpDate: "2026-03-12",
    });
    expect(result.nodeTrace.at(-1)).toMatchObject({ node: "draft_action", status: "fallback" });
  });

  it("records a verified unsupported blocker, which the engine then gates", async () => {
    const note = "Delta told us they need an on-prem air-gapped deployment, which we don't support.";
    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          hasUnsupportedBlocker: { value: true, quote: "they need an on-prem air-gapped deployment, which we don't support" },
          blockerDetail: { value: "On-prem air-gapped deployment", quote: "on-prem air-gapped deployment" },
        }),
      ],
      verify_entailment: [verdicts(["hasUnsupportedBlocker", true], ["blockerDetail", true])],
      draft_action: [{ summary: "Send Delta a clear decline note about the air-gapped requirement", followUpInDays: 1 }],
    });

    const result = await runNoteIntake(requestFor("delta", note), { llm });

    expect(result.draftPatch).toEqual({ newBlocker: "On-prem air-gapped deployment" });
    expect(result.impact.after).toEqual({ rank: 6, score: null, stance: "excluded" });
    expect(result.impact.displaced).toEqual([]); // Delta itself leaves; Cedar backfills
    expect(result.impact.gateReasonsAfter).toEqual(["Needs unsupported workflow: On-prem air-gapped deployment"]);
  });
});
