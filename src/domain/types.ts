/**
 * Observed facts: only what a rep heard or recorded about a prospect.
 * Anything not stated stays "unknown" or null. Never fill these in by inference.
 */
export type WorkflowFit = "strong" | "apparent" | "mixed" | "poor";

/** "no_access" means we confirmed we cannot reach the economic buyer. */
export type BuyerStatus = "confirmed" | "unknown" | "no_access";

/** "not_confirmed" means the rep asked and has not heard a yes yet. */
export type BudgetStatus = "confirmed" | "not_confirmed" | "unknown";

/** How our product handles a requirement the prospect stated. */
export type RequirementSupport = "supported" | "custom_work" | "unsupported";

export interface StatedRequirement {
  description: string;
  support: RequirementSupport;
}

export interface EconomicBuyer {
  status: BuyerStatus;
  /** Only when a rep recorded it. */
  name: string | null;
  /** Only when a rep recorded it. */
  title: string | null;
}

export interface ProspectFacts {
  id: string;
  company: string;
  potentialAcvUsd: number;
  workflowFit: WorkflowFit;
  economicBuyer: EconomicBuyer;
  budget: BudgetStatus;
  /** ISO date (YYYY-MM-DD) the prospect said they would decide by, or null if unstated. */
  targetDecisionDate: string | null;
  requirements: StatedRequirement[];
}

/* ---------- Derived evaluation (never stored back into facts) ---------- */

export type GateReasonCode = "poor_fit" | "unsupported_requirement" | "no_buyer_access";

export interface GateReason {
  code: GateReasonCode;
  detail: string;
}

/** Points per component of the 0-100 prioritization score. Not a close forecast. */
export interface PriorityBreakdown {
  workflowFit: number;
  buyerReadiness: number;
  budgetReadiness: number;
  readiness: number;
  timeline: number;
  dealValue: number;
  total: number;
}

export type Stance = "work_today" | "queue_next" | "excluded";

export interface PriorityEvaluation {
  prospectId: string;
  /** 1-based position in today's ranking. */
  rank: number;
  eligible: boolean;
  gateReasons: GateReason[];
  /** null when the prospect is gated out; gated deals are not scored. */
  priorityScore: PriorityBreakdown | null;
  inFocusSlot: boolean;
  stance: Stance;
  /** Calendar days from the reference date to the stated decision date (negative if passed); null if unknown. */
  daysToDecision: number | null;
  missingInfo: string[];
  scopeRisks: string[];
}

export interface TriageEntry {
  facts: ProspectFacts;
  evaluation: PriorityEvaluation;
}

export interface TriageResult {
  asOf: string;
  focusSlots: number;
  /** Ranked best-first. */
  entries: TriageEntry[];
}
