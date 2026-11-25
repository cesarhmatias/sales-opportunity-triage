import { isIsoDate } from "./dates";
import { FOCUS_SLOTS, SAMPLE_REFERENCE_DATE, SEED_PROSPECTS } from "./seed";
import { triage } from "./triageEngine";
import type {
  BudgetStatus,
  BuyerStatus,
  ManagerOverride,
  NextAction,
  OverrideDecision,
  ProspectFacts,
  Stance,
  TriageResult,
  WorkflowFit,
} from "./types";
import {
  TEAM,
  validateConfirmationChange,
  validateNextAction,
  validateReason,
  type FieldError,
} from "./validation";

/* ---------- State ---------- */

export interface RankSnapshot {
  rank: number;
  ruleRank: number;
  /** null when gated (not scored). */
  score: number | null;
  stance: Stance;
}

export interface FieldDiff {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type RevisionKind = "qualification_update" | "override_set" | "override_cleared";

/** One append-only history record. Revisions are never edited or removed. */
export interface Revision {
  id: string;
  prospectId: string;
  kind: RevisionKind;
  /** ISO timestamp. */
  at: string;
  actorId: string;
  reason: string | null;
  before: RankSnapshot;
  after: RankSnapshot;
  fieldDiffs: FieldDiff[];
  /** The next action as saved with this revision (null for override changes). */
  nextAction: NextAction | null;
}

export interface WorkspaceState {
  version: 1;
  /** Simulated signed-in team member. */
  actorId: string;
  prospects: ProspectFacts[];
  nextActions: Record<string, NextAction>;
  overrides: ManagerOverride[];
  revisions: Revision[];
}

export const REFERENCE_DATE = SAMPLE_REFERENCE_DATE;

export function createSeedWorkspace(actorId = "jordan-lee"): WorkspaceState {
  return {
    version: 1,
    actorId,
    prospects: structuredClone(SEED_PROSPECTS) as ProspectFacts[],
    nextActions: {},
    overrides: [],
    revisions: [],
  };
}

export function triageWorkspace(state: WorkspaceState, asOf = REFERENCE_DATE): TriageResult {
  return triage(state.prospects, { asOf, focusSlots: FOCUS_SLOTS, overrides: state.overrides });
}

export function revisionsFor(state: WorkspaceState, prospectId: string): Revision[] {
  return state.revisions.filter((r) => r.prospectId === prospectId);
}

function snapshotOf(result: TriageResult, prospectId: string): RankSnapshot {
  const entry = result.entries.find((e) => e.facts.id === prospectId);
  if (!entry) throw new Error(`Unknown prospect: ${prospectId}`);
  const { rank, ruleRank, priorityScore, stance } = entry.evaluation;
  return { rank, ruleRank, score: priorityScore?.total ?? null, stance };
}

/* ---------- Qualification change + next action ---------- */

/** The fields a rep can re-qualify. Everything else on ProspectFacts is fixed intake data. */
export interface QualificationDraft {
  workflowFit: WorkflowFit;
  buyerStatus: BuyerStatus;
  buyerName: string;
  buyerTitle: string;
  budget: BudgetStatus;
  /** "" when the prospect has not stated a date. */
  targetDecisionDate: string;
}

export function draftFromFacts(facts: ProspectFacts): QualificationDraft {
  return {
    workflowFit: facts.workflowFit,
    buyerStatus: facts.economicBuyer.status,
    buyerName: facts.economicBuyer.name ?? "",
    buyerTitle: facts.economicBuyer.title ?? "",
    budget: facts.budget,
    targetDecisionDate: facts.targetDecisionDate ?? "",
  };
}

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function applyDraft(facts: ProspectFacts, draft: QualificationDraft): ProspectFacts {
  return {
    ...facts,
    workflowFit: draft.workflowFit,
    economicBuyer: {
      status: draft.buyerStatus,
      name: blankToNull(draft.buyerName),
      title: blankToNull(draft.buyerTitle),
    },
    budget: draft.budget,
    targetDecisionDate: blankToNull(draft.targetDecisionDate),
  };
}

const show = (value: string | null) => (value === null ? "not recorded" : value);

export function diffFacts(before: ProspectFacts, after: ProspectFacts): FieldDiff[] {
  const pairs: [string, string, string | null, string | null][] = [
    ["workflowFit", "Workflow fit", before.workflowFit, after.workflowFit],
    ["economicBuyer.status", "Economic buyer", before.economicBuyer.status, after.economicBuyer.status],
    ["economicBuyer.name", "Buyer name", before.economicBuyer.name, after.economicBuyer.name],
    ["economicBuyer.title", "Buyer title", before.economicBuyer.title, after.economicBuyer.title],
    ["budget", "Budget", before.budget, after.budget],
    ["targetDecisionDate", "Decision date", before.targetDecisionDate, after.targetDecisionDate],
  ];
  return pairs
    .filter(([, , from, to]) => from !== to)
    .map(([field, label, from, to]) => ({ field, label, from: show(from), to: show(to) }));
}

export interface QualificationUpdateInput {
  prospectId: string;
  draft: QualificationDraft;
  reason: string;
  nextAction: NextAction;
  actorId: string;
  /** ISO timestamp, supplied by the caller (event handler), never read here. */
  at: string;
  revisionId: string;
}

export type ApplyResult = { ok: true; state: WorkspaceState; revision: Revision } | { ok: false; errors: FieldError[] };

/** Checks a qualification save: real decision date (or blank), reason when unconfirming, and a valid next action. */
export function validateQualificationUpdate(
  facts: ProspectFacts,
  input: Pick<QualificationUpdateInput, "draft" | "reason" | "nextAction">,
  asOf = REFERENCE_DATE,
): FieldError[] {
  const errors: FieldError[] = [];
  const { draft } = input;

  if (draft.targetDecisionDate.trim() !== "" && !isIsoDate(draft.targetDecisionDate.trim())) {
    errors.push({ field: "targetDecisionDate", message: "Decision date must be YYYY-MM-DD or left blank if unknown." });
  }

  const reasonNeeded = [
    validateConfirmationChange({
      field: "economicBuyer",
      from: facts.economicBuyer.status,
      to: draft.buyerStatus,
      reason: input.reason,
    }),
    validateConfirmationChange({ field: "budget", from: facts.budget, to: draft.budget, reason: input.reason }),
  ].find((r) => !r.ok);
  if (reasonNeeded && !reasonNeeded.ok) {
    errors.push({
      field: "reason",
      message: `Unconfirming a confirmed buyer or budget needs a reason. ${reasonNeeded.errors[0].message}`,
    });
  }

  const action = validateNextAction(input.nextAction, { today: asOf });
  if (!action.ok) {
    errors.push(...action.errors.map((e) => ({ field: `nextAction.${e.field}`, message: e.message })));
  }
  return errors;
}

export function applyQualificationUpdate(
  state: WorkspaceState,
  input: QualificationUpdateInput,
  asOf = REFERENCE_DATE,
): ApplyResult {
  const facts = state.prospects.find((p) => p.id === input.prospectId);
  if (!facts) return { ok: false, errors: [{ field: "prospectId", message: "Unknown prospect." }] };

  const errors = validateQualificationUpdate(facts, input, asOf);
  if (errors.length > 0) return { ok: false, errors };

  const updatedFacts = applyDraft(facts, input.draft);
  const nextAction: NextAction = {
    summary: input.nextAction.summary.trim(),
    ownerId: input.nextAction.ownerId,
    followUpDate: input.nextAction.followUpDate,
  };
  const next: WorkspaceState = {
    ...state,
    prospects: state.prospects.map((p) => (p.id === facts.id ? updatedFacts : p)),
    nextActions: { ...state.nextActions, [facts.id]: nextAction },
  };

  const revision: Revision = {
    id: input.revisionId,
    prospectId: facts.id,
    kind: "qualification_update",
    at: input.at,
    actorId: input.actorId,
    reason: blankToNull(input.reason),
    before: snapshotOf(triageWorkspace(state, asOf), facts.id),
    after: snapshotOf(triageWorkspace(next, asOf), facts.id),
    fieldDiffs: diffFacts(facts, updatedFacts),
    nextAction,
  };
  return { ok: true, state: { ...next, revisions: [...state.revisions, revision] }, revision };
}

/* ---------- Manager override ---------- */

export interface OverrideInput {
  prospectId: string;
  /** null clears the override. */
  decision: OverrideDecision | null;
  reason: string;
  actorId: string;
  at: string;
  revisionId: string;
}

export function isManager(actorId: string): boolean {
  return TEAM.some((m) => m.id === actorId && m.role === "manager");
}

const OVERRIDE_LABEL: Record<OverrideDecision | "none", string> = {
  pin_focus: "Pinned to today's focus",
  hold_out: "Held out of today's focus",
  none: "No override",
};

export function applyManagerOverride(
  state: WorkspaceState,
  input: OverrideInput,
  asOf = REFERENCE_DATE,
): ApplyResult {
  const errors: FieldError[] = [];
  const before = triageWorkspace(state, asOf);
  const entry = before.entries.find((e) => e.facts.id === input.prospectId);
  if (!entry) return { ok: false, errors: [{ field: "prospectId", message: "Unknown prospect." }] };

  if (!isManager(input.actorId)) {
    errors.push({ field: "actorId", message: "Only the sales manager can set or clear an override." });
  }
  // A stale override on a prospect that later became gated can still be cleared.
  if (!entry.evaluation.eligible && input.decision !== null) {
    errors.push({ field: "decision", message: "Gated prospects cannot be overridden into or out of focus." });
  }
  const current = state.overrides.find((o) => o.prospectId === input.prospectId) ?? null;
  if (input.decision === (current?.decision ?? null)) {
    errors.push({ field: "decision", message: "Choose a different override than the current one." });
  }
  if (input.decision === "pin_focus") {
    // Pins on gated prospects are ignored by allocation, so they don't use up the cap.
    const eligibleIds = new Set(before.entries.filter((e) => e.evaluation.eligible).map((e) => e.facts.id));
    const otherPins = state.overrides.filter(
      (o) => o.decision === "pin_focus" && o.prospectId !== input.prospectId && eligibleIds.has(o.prospectId),
    );
    if (otherPins.length >= before.focusSlots) {
      errors.push({ field: "decision", message: `All ${before.focusSlots} focus slots are already pinned.` });
    }
  }
  if (input.decision !== null) {
    const reasonError = validateReason(input.reason);
    if (reasonError) errors.push({ field: "reason", message: reasonError });
  }
  if (errors.length > 0) return { ok: false, errors };

  const others = state.overrides.filter((o) => o.prospectId !== input.prospectId);
  const overrides: ManagerOverride[] =
    input.decision === null
      ? others
      : [
          ...others,
          {
            prospectId: input.prospectId,
            decision: input.decision,
            reason: input.reason.trim(),
            setBy: input.actorId,
            setAt: input.at,
          },
        ];
  const next: WorkspaceState = { ...state, overrides };

  const revision: Revision = {
    id: input.revisionId,
    prospectId: input.prospectId,
    kind: input.decision === null ? "override_cleared" : "override_set",
    at: input.at,
    actorId: input.actorId,
    reason: blankToNull(input.reason),
    before: snapshotOf(before, input.prospectId),
    after: snapshotOf(triageWorkspace(next, asOf), input.prospectId),
    fieldDiffs: [
      {
        field: "override",
        label: "Manager override",
        from: OVERRIDE_LABEL[current?.decision ?? "none"],
        to: OVERRIDE_LABEL[input.decision ?? "none"],
      },
    ],
    nextAction: null,
  };
  return { ok: true, state: { ...next, revisions: [...state.revisions, revision] }, revision };
}
