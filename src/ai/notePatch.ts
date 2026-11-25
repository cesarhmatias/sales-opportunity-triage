import { addDays } from "../domain/dates";
import type { ProspectFacts } from "../domain/types";
import { applyDraft, draftFromFacts } from "../domain/workspace";
import type { DraftPatch, FieldProposal } from "./noteIntakeContract";

/**
 * Pure helpers for the note copilot. Nothing here calls a model: these are the
 * deterministic guards around what the model proposes.
 */

/** Collapses whitespace and unifies curly quotes/apostrophes so copy-paste artifacts don't fail a literal match. */
export function normalizeForQuote(text: string): string {
  return text
    .replace(/[‘’‛′`´]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a non-empty, literal (normalized) substring of `note`. Case-sensitive on purpose. */
export function isLiteralQuote(note: string, quote: string): boolean {
  const q = normalizeForQuote(quote);
  return q.length > 0 && normalizeForQuote(note).includes(q);
}

const FIT = new Set(["strong", "apparent", "mixed", "poor"]);
const BUYER = new Set(["confirmed", "no_access"]);
const BUDGET = new Set(["confirmed", "not_confirmed"]);

/**
 * Deterministic first pass of verify_entailment. Returns a reason when a proposal must be
 * stripped before any model sees it, or null when it may go on to the entailment check.
 */
export function literalCheck(note: string, proposal: FieldProposal): string | null {
  if (!isLiteralQuote(note, proposal.quote)) {
    return "Quote is not a literal excerpt of the call note.";
  }
  const { field, value } = proposal;
  const quote = normalizeForQuote(proposal.quote);
  switch (field) {
    case "fit":
      return typeof value === "string" && FIT.has(value) ? null : "Unknown workflow-fit value.";
    case "buyerStatus":
      return typeof value === "string" && BUYER.has(value) ? null : "Buyer status must be confirmed or no_access.";
    case "budgetStatus":
      return typeof value === "string" && BUDGET.has(value) ? null : "Budget status must be confirmed or not_confirmed.";
    case "buyerName":
      // A name must be copied from the note, never inferred from a role ("their COO").
      return typeof value === "string" && value.trim() !== "" && quote.includes(normalizeForQuote(value))
        ? null
        : "Buyer name does not appear verbatim in its quote.";
    case "timelineDays":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 365
        ? null
        : "Timeline must be a whole number of days between 0 and 365.";
    case "hasUnsupportedBlocker":
      return value === true ? null : "Only a newly stated blocker can be recorded.";
    case "blockerDetail":
      return typeof value === "string" && value.trim() !== "" ? null : "Blocker detail is empty.";
  }
}

const valueOf = (proposals: FieldProposal[], field: FieldProposal["field"]) =>
  proposals.find((p) => p.field === field)?.value;

/** Builds form-ready values from verified proposals only. */
export function toDraftPatch(verified: FieldProposal[], asOf: string): DraftPatch {
  const patch: DraftPatch = {};
  const fit = valueOf(verified, "fit");
  if (typeof fit === "string" && FIT.has(fit)) patch.workflowFit = fit as DraftPatch["workflowFit"];
  const buyer = valueOf(verified, "buyerStatus");
  if (typeof buyer === "string" && BUYER.has(buyer)) patch.buyerStatus = buyer as DraftPatch["buyerStatus"];
  const name = valueOf(verified, "buyerName");
  if (typeof name === "string") patch.buyerName = name.trim();
  const budget = valueOf(verified, "budgetStatus");
  if (typeof budget === "string" && BUDGET.has(budget)) patch.budget = budget as DraftPatch["budget"];
  const days = valueOf(verified, "timelineDays");
  if (typeof days === "number") patch.targetDecisionDate = addDays(asOf, days);
  if (valueOf(verified, "hasUnsupportedBlocker") === true) {
    const detail = valueOf(verified, "blockerDetail");
    const quote = verified.find((p) => p.field === "hasUnsupportedBlocker")?.quote ?? "";
    patch.newBlocker = (typeof detail === "string" && detail.trim() !== "" ? detail : normalizeForQuote(quote)).slice(0, 300);
  }
  return patch;
}

/** Applies a verified patch to a prospect through the same path the manual form uses. */
export function applyPatchToFacts(facts: ProspectFacts, patch: DraftPatch): ProspectFacts {
  const draft = draftFromFacts(facts);
  return applyDraft(facts, {
    ...draft,
    workflowFit: patch.workflowFit ?? draft.workflowFit,
    buyerStatus: patch.buyerStatus ?? draft.buyerStatus,
    buyerName: patch.buyerName ?? draft.buyerName,
    budget: patch.budget ?? draft.budget,
    targetDecisionDate: patch.targetDecisionDate ?? draft.targetDecisionDate,
    newBlocker: patch.newBlocker ?? "",
  });
}
