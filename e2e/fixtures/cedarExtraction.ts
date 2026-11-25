import { extractNoteResponseSchema, type ExtractNoteResponse } from "../../src/ai/noteIntakeContract";

/**
 * Deterministic stand-in for a live /api/extract-note response on the Cedar sample note,
 * so the E2E copilot flow runs without an API key or token spend. Parsed through the real
 * response schema so the fixture can't drift from the contract the UI validates against.
 */
export const cedarExtraction: ExtractNoteResponse = extractNoteResponseSchema.parse({
  prospectId: "cedar",
  attempts: 2,
  verified: [
    { field: "buyerStatus", value: "confirmed", quote: "confirmed she is the final decision maker for this purchase" },
    { field: "buyerName", value: "Maya Lin", quote: "Maya Lin, VP of Operations, confirmed she is the final decision maker" },
    { field: "timelineDays", value: 21, quote: "They want to make a buying decision within 21 days." },
  ],
  rejected: [
    {
      field: "budgetStatus",
      value: "not_confirmed",
      quote: "Budget hasn't been discussed with finance yet.",
      stage: "entailment",
      reason: "Not discussed yet is unknown, not asked-and-not-confirmed.",
      attempt: 1,
    },
  ],
  draftPatch: { buyerStatus: "confirmed", buyerName: "Maya Lin", targetDecisionDate: "2026-03-31" },
  impact: {
    company: "Cedar",
    before: { rank: 4, score: 37, stance: "queue_next" },
    after: { rank: 3, score: 62, stance: "work_today" },
    displaced: ["Fern"],
    missingInfoAfter: ["Economic buyer confirmed, but name/title not recorded", "Budget not yet discussed"],
    gateReasonsAfter: [],
  },
  nextAction: {
    action: {
      summary: "Call Maya Lin Thursday about procurement timeline",
      ownerId: "alex-rivera",
      followUpDate: "2026-03-12",
    },
    source: "model",
    modelDraftErrors: [],
  },
  nodeTrace: [
    { node: "extract_facts", status: "ok", summary: "Attempt 1: proposed 4 field(s).", durationMs: 812 },
    { node: "verify_entailment", status: "rejected", summary: "Attempt 1: 3 verified, 1 rejected (budgetStatus: entailment).", durationMs: 640 },
    { node: "extract_facts", status: "ok", summary: "Attempt 2: proposed 3 field(s).", durationMs: 701 },
    { node: "verify_entailment", status: "ok", summary: "Attempt 2: 3 verified.", durationMs: 590 },
    { node: "simulate_impact", status: "ok", summary: "Cedar #4 → #3 (37 pts → 62 pts); displaces Fern.", durationMs: 1 },
    { node: "draft_action", status: "ok", summary: "Drafted a next action that passes validateNextAction.", durationMs: 455 },
  ],
});
