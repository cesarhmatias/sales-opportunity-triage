import { describe, expect, it } from "vitest";
import { createSeedWorkspace } from "../../domain/workspace";
import { runNoteIntake } from "../noteIntakeGraph";
import { describeRetry, formatMovement, previewChanges } from "../notePreview";
import { literalCheck } from "../notePatch";
import { SAMPLE_NOTES } from "../sampleNotes";
import { ScriptedLLM, extraction, requestFor, verdicts } from "./scriptedLLM";

const cedar = createSeedWorkspace().prospects.find((p) => p.id === "cedar")!;
const sample = (id: string) => SAMPLE_NOTES.find((s) => s.id === id)!.text("Cedar");

describe("sample notes through the graph", () => {
  it("buyer-confirmed sample: Maya Lin + 21 days moves Cedar #4, 37 pts → #3, 62 pts; budget stays unknown", async () => {
    const note = sample("buyer-confirmed");
    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          buyerStatus: { value: "confirmed", quote: "confirmed she is the final decision maker for this purchase" },
          buyerName: { value: "Maya Lin", quote: "Maya Lin, VP of Operations, confirmed she is the final decision maker" },
          timelineDays: { value: 21, quote: "They want to make a buying decision within 21 days." },
        }),
      ],
      verify_entailment: [verdicts(["buyerStatus", true], ["buyerName", true], ["timelineDays", true])],
      draft_action: [{ summary: "Ask Maya Lin to loop in finance on Cedar's budget this week", followUpInDays: 2 }],
    });

    const result = await runNoteIntake(requestFor("cedar", note), { llm });

    expect(formatMovement(result.impact)).toBe("Cedar: #4, 37 pts → #3, 62 pts");
    const { changes, unchanged } = previewChanges(cedar, result);
    expect(changes.map((c) => `${c.label}: ${c.from} → ${c.to}`)).toEqual([
      "Economic buyer status: unknown → confirmed",
      "Buyer name: not recorded → Maya Lin",
      "Decision date: unknown → 2026-03-31",
    ]);
    expect(changes[2].quotes).toEqual(["They want to make a buying decision within 21 days."]);
    expect(unchanged.map((u) => u.text)).toEqual([
      "Workflow fit kept as apparent",
      "Budget status kept as unknown",
      "Unsupported workflow blocker kept as none added",
    ]);
  });

  it("guardrail sample: plausible-but-wrong quotes fail the literal check and hedged ones are rejected", async () => {
    const note = sample("guardrail");
    // Paraphrases a careless extractor might produce are not literal excerpts...
    expect(literalCheck(note, { field: "budgetStatus", value: "confirmed", quote: "budget is confirmed" })).toMatch(/not a literal/);
    expect(literalCheck(note, { field: "timelineDays", value: 3, quote: "decide in 3 days" })).toMatch(/not a literal/);
    // ...but a conditional clause IS literal ("If budget is approved next quarter"), so only the
    // entailment step can catch it. Both layers are needed.
    expect(literalCheck(note, { field: "budgetStatus", value: "confirmed", quote: "budget is approved" })).toBeNull();

    const llm = new ScriptedLLM({
      extract_facts: [
        extraction({
          budgetStatus: { value: "confirmed", quote: "already has budget set aside" },
          hasUnsupportedBlocker: { value: true, quote: "asked whether we support regulated workflows" },
        }),
        extraction({}),
      ],
      verify_entailment: [
        verdicts(
          ["budgetStatus", false, "Third-party claim from a partner, not the prospect."],
          ["hasUnsupportedBlocker", false, "They said they don't need a regulated workflow today."],
        ),
      ],
      draft_action: [{ summary: "Ask Cedar who the final decision maker is and when they decide", followUpInDays: 2 }],
    });

    const result = await runNoteIntake(requestFor("cedar", note), { llm });
    const { changes, unchanged } = previewChanges(cedar, result);

    expect(changes).toEqual([]);
    expect(formatMovement(result.impact)).toBe("Cedar: #4, 37 pts → #4, 37 pts");
    expect(unchanged.find((u) => u.key === "budget")).toEqual({
      key: "budget",
      text: "Budget status kept as unknown",
      rejectedBecause: "Third-party claim from a partner, not the prospect.",
    });
    expect(describeRetry(result)).toBe(
      "Retry: verify_entailment rejected 2 fields (budgetStatus, hasUnsupportedBlocker) on attempt 1, so extract_facts ran once more with that critique.",
    );
  });
});

describe("preview helpers", () => {
  it("treats a restated current value as unchanged", () => {
    const birch = createSeedWorkspace().prospects.find((p) => p.id === "birch")!;
    const { changes, unchanged } = previewChanges(birch, {
      draftPatch: { buyerStatus: "confirmed", budget: "not_confirmed" },
      verified: [],
      rejected: [],
    });
    expect(changes.map((c) => `${c.label}: ${c.from} → ${c.to}`)).toEqual(["Budget status: unknown → not confirmed"]);
    expect(unchanged[1].text).toBe("Economic buyer status kept as confirmed (the note restates it)");
  });

  it("only describes a retry when extraction ran twice", () => {
    expect(describeRetry({ attempts: 1, rejected: [] })).toBeNull();
  });
});
