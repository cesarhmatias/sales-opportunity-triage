import type { ProspectFacts } from "../domain/types";
import type { DraftPatch, ExtractNoteResponse, FieldProposal, ImpactSummary, NoteField } from "./noteIntakeContract";

/** Pure view-model helpers for the copilot preview card. */

type PatchKey = keyof DraftPatch;

const PATCH_FIELDS: { key: PatchKey; label: string; sources: NoteField[]; current: (f: ProspectFacts) => string }[] = [
  { key: "workflowFit", label: "Workflow fit", sources: ["fit"], current: (f) => f.workflowFit },
  { key: "buyerStatus", label: "Economic buyer status", sources: ["buyerStatus"], current: (f) => f.economicBuyer.status },
  { key: "buyerName", label: "Buyer name", sources: ["buyerName"], current: (f) => f.economicBuyer.name ?? "not recorded" },
  { key: "budget", label: "Budget status", sources: ["budgetStatus"], current: (f) => f.budget },
  {
    key: "targetDecisionDate",
    label: "Decision date",
    sources: ["timelineDays"],
    current: (f) => f.targetDecisionDate ?? "unknown",
  },
  {
    key: "newBlocker",
    label: "Unsupported workflow blocker",
    sources: ["hasUnsupportedBlocker", "blockerDetail"],
    current: () => "none added",
  },
];

const human = (value: string) => value.replace(/_/g, " ");

export interface PreviewChange {
  key: PatchKey;
  label: string;
  from: string;
  to: string;
  /** Verbatim quote(s) from the note that justify the change. */
  quotes: string[];
}

export interface PreviewUnchanged {
  key: PatchKey;
  /** e.g. "Budget status kept as unknown". */
  text: string;
  /** Why a proposal for this field was dropped, if one was made. */
  rejectedBecause: string | null;
}

export function previewChanges(
  facts: ProspectFacts,
  response: Pick<ExtractNoteResponse, "draftPatch" | "verified" | "rejected">,
): { changes: PreviewChange[]; unchanged: PreviewUnchanged[] } {
  const changes: PreviewChange[] = [];
  const unchanged: PreviewUnchanged[] = [];
  const quotesFor = (sources: NoteField[]) =>
    response.verified.filter((p: FieldProposal) => sources.includes(p.field)).map((p) => p.quote);

  for (const field of PATCH_FIELDS) {
    const current = field.current(facts);
    const proposed = response.draftPatch[field.key];
    if (proposed !== undefined && proposed !== "" && proposed !== current) {
      changes.push({ key: field.key, label: field.label, from: human(current), to: human(proposed), quotes: quotesFor(field.sources) });
      continue;
    }
    const rejection = response.rejected.filter((r) => field.sources.includes(r.field)).at(-1);
    const confirmedSame = proposed !== undefined && proposed === current;
    unchanged.push({
      key: field.key,
      text: `${field.label} kept as ${human(current)}${confirmedSame ? " (the note restates it)" : ""}`,
      rejectedBecause: rejection ? rejection.reason : null,
    });
  }
  return { changes, unchanged };
}

const score = (s: number | null) => (s === null ? "gated" : `${s} pts`);

/** e.g. "Cedar: #4, 37 pts → #3, 62 pts". */
export function formatMovement(impact: ImpactSummary): string {
  return `${impact.company}: #${impact.before.rank}, ${score(impact.before.score)} → #${impact.after.rank}, ${score(impact.after.score)}`;
}

/** Explains the retry loop when verification sent extraction back for a second pass. */
export function describeRetry(response: Pick<ExtractNoteResponse, "attempts" | "rejected">): string | null {
  if (response.attempts < 2) return null;
  const firstPass = response.rejected.filter((r) => r.attempt === 1);
  return `Retry: verify_entailment rejected ${firstPass.length} field${firstPass.length === 1 ? "" : "s"} (${firstPass
    .map((r) => r.field)
    .join(", ")}) on attempt 1, so extract_facts ran once more with that critique.`;
}
