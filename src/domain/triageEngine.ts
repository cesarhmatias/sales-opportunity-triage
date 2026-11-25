import { daysBetween } from "./dates";
import type {
  GateReason,
  ManagerOverride,
  PriorityBreakdown,
  PriorityEvaluation,
  ProspectFacts,
  Stance,
  TriageEntry,
  TriageResult,
  WorkflowFit,
} from "./types";

export const DEFAULT_FOCUS_SLOTS = 3;

/* ---------- Scoring rules (0-100 prioritization score, not a close forecast) ---------- */

const FIT_POINTS: Record<WorkflowFit, number> = {
  strong: 40,
  apparent: 25,
  mixed: 10,
  poor: 0,
};

export function workflowFitPoints(fit: WorkflowFit): number {
  return FIT_POINTS[fit];
}

/** Unknown timeline scores 0 (below >60d) so discovering any date raises the score. */
export function timelinePoints(daysToDecision: number | null): number {
  if (daysToDecision === null || daysToDecision < 0) return 0;
  if (daysToDecision <= 14) return 15;
  if (daysToDecision <= 30) return 10;
  if (daysToDecision <= 60) return 6;
  return 2;
}

export function acvPoints(acvUsd: number): number {
  if (acvUsd >= 80_000) return 15;
  if (acvUsd >= 50_000) return 12;
  if (acvUsd >= 30_000) return 8;
  return 4;
}

export function scoreProspect(facts: ProspectFacts, daysToDecision: number | null): PriorityBreakdown {
  const workflowFit = workflowFitPoints(facts.workflowFit);
  const buyerReadiness = facts.economicBuyer.status === "confirmed" ? 15 : 0;
  // not_confirmed scores like unknown: asking and hearing "not yet" is not penalized.
  const budgetReadiness = facts.budget === "confirmed" ? 15 : 0;
  const readiness = buyerReadiness + budgetReadiness;
  const timeline = timelinePoints(daysToDecision);
  const dealValue = acvPoints(facts.potentialAcvUsd);
  return {
    workflowFit,
    buyerReadiness,
    budgetReadiness,
    readiness,
    timeline,
    dealValue,
    total: workflowFit + readiness + timeline + dealValue,
  };
}

/* ---------- Eligibility gate ---------- */

export function gateReasons(facts: ProspectFacts): GateReason[] {
  const reasons: GateReason[] = [];
  if (facts.workflowFit === "poor") {
    reasons.push({ code: "poor_fit", detail: "Poor workflow fit" });
  }
  for (const req of facts.requirements) {
    if (req.support === "unsupported") {
      reasons.push({
        code: "unsupported_requirement",
        detail: `Needs unsupported workflow: ${req.description}`,
      });
    }
  }
  if (facts.economicBuyer.status === "no_access") {
    reasons.push({ code: "no_buyer_access", detail: "Confirmed no access to the economic buyer" });
  }
  return reasons;
}

/* ---------- Inspection details ---------- */

function missingInfo(facts: ProspectFacts, rawDays: number | null): string[] {
  const items: string[] = [];
  const buyer = facts.economicBuyer;
  if (buyer.status === "unknown") {
    items.push("Economic buyer not identified");
  } else if (buyer.status === "confirmed" && (buyer.name === null || buyer.title === null)) {
    items.push("Economic buyer confirmed, but name/title not recorded");
  }

  if (facts.budget === "unknown") {
    items.push("Budget not yet discussed");
  } else if (facts.budget === "not_confirmed") {
    items.push("Budget asked about, not yet confirmed");
  }

  if (facts.targetDecisionDate === null) {
    items.push("Decision date unknown");
  } else if (rawDays !== null && rawDays < 0) {
    items.push(`Stated decision date ${facts.targetDecisionDate} has passed; reconfirm timeline`);
  }
  return items;
}

function scopeRisks(facts: ProspectFacts): string[] {
  return facts.requirements
    .filter((req) => req.support === "custom_work")
    .map((req) => `Requires custom work: ${req.description}`);
}

/* ---------- Ranking ---------- */

interface Scored {
  facts: ProspectFacts;
  gate: GateReason[];
  score: PriorityBreakdown | null;
  /** Usable days to decision (null when unknown or already passed). */
  days: number | null;
  rawDays: number | null;
}

function compareCodePoints(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Deterministic order: total -> fit -> readiness -> timeline pts -> shorter known timeline -> ACV -> company -> id. */
function compareEligible(a: Scored, b: Scored): number {
  const sa = a.score!;
  const sb = b.score!;
  return (
    sb.total - sa.total ||
    sb.workflowFit - sa.workflowFit ||
    sb.readiness - sa.readiness ||
    sb.timeline - sa.timeline ||
    (a.days ?? Infinity) - (b.days ?? Infinity) ||
    b.facts.potentialAcvUsd - a.facts.potentialAcvUsd ||
    compareCodePoints(a.facts.company, b.facts.company) ||
    compareCodePoints(a.facts.id, b.facts.id)
  );
}

function compareGated(a: Scored, b: Scored): number {
  return compareCodePoints(a.facts.company, b.facts.company) || compareCodePoints(a.facts.id, b.facts.id);
}

export interface TriageOptions {
  /** Reference date (YYYY-MM-DD). Injected; the engine never reads the clock. */
  asOf: string;
  focusSlots?: number;
  /** Manager allocation decisions. They change slots, never scores. */
  overrides?: readonly ManagerOverride[];
}

/**
 * Ranks prospects and allocates today's focus slots.
 *
 * Allocation: gated prospects never get a slot (overrides on them are ignored).
 * Eligible prospects pinned by the manager take slots first, in rule order, up to
 * the slot count; remaining slots go to the best-ranked eligible prospects that
 * are not held out. Displayed rank follows allocation, so a prospect outside the
 * slots never ranks above one inside them. `ruleRank` keeps the pure rule order.
 */
export function triage(prospects: readonly ProspectFacts[], options: TriageOptions): TriageResult {
  const focusSlots = options.focusSlots ?? DEFAULT_FOCUS_SLOTS;
  const overrides = new Map((options.overrides ?? []).map((o) => [o.prospectId, o]));

  const scored: Scored[] = prospects.map((facts) => {
    const rawDays = facts.targetDecisionDate === null ? null : daysBetween(options.asOf, facts.targetDecisionDate);
    const days = rawDays !== null && rawDays >= 0 ? rawDays : null;
    const gate = gateReasons(facts);
    return { facts, gate, days, rawDays, score: gate.length === 0 ? scoreProspect(facts, days) : null };
  });

  const eligible = scored.filter((s) => s.gate.length === 0).sort(compareEligible);
  const gated = scored.filter((s) => s.gate.length > 0).sort(compareGated);
  const ruleOrder = [...eligible, ...gated];

  const decisionOf = (s: Scored) => overrides.get(s.facts.id)?.decision;
  const pinned = eligible.filter((s) => decisionOf(s) === "pin_focus");
  const pinnedInSlots = pinned.slice(0, focusSlots);
  const filled = eligible
    .filter((s) => decisionOf(s) === undefined)
    .slice(0, Math.max(0, focusSlots - pinnedInSlots.length));
  const inSlots = new Set([...pinnedInSlots, ...filled]);

  const allocationOrder = [
    ...eligible.filter((s) => inSlots.has(s)),
    ...eligible.filter((s) => !inSlots.has(s)),
    ...gated,
  ];

  const entries: TriageEntry[] = allocationOrder.map((s, index) => {
    const isEligible = s.gate.length === 0;
    const inFocusSlot = inSlots.has(s);
    const stance: Stance = !isEligible ? "excluded" : inFocusSlot ? "work_today" : "queue_next";
    const override = overrides.get(s.facts.id) ?? null;
    const evaluation: PriorityEvaluation = {
      prospectId: s.facts.id,
      rank: index + 1,
      ruleRank: ruleOrder.indexOf(s) + 1,
      eligible: isEligible,
      gateReasons: s.gate,
      priorityScore: s.score,
      inFocusSlot,
      stance,
      daysToDecision: s.rawDays,
      missingInfo: missingInfo(s.facts, s.rawDays),
      scopeRisks: scopeRisks(s.facts),
      override,
      overrideNote: overrideNote(override, isEligible, inFocusSlot),
    };
    return { facts: s.facts, evaluation };
  });

  return { asOf: options.asOf, focusSlots, entries };
}

function overrideNote(override: ManagerOverride | null, eligible: boolean, inFocusSlot: boolean): string | null {
  if (!override) return null;
  if (!eligible) return "Override ignored: the eligibility gate still excludes this prospect.";
  if (override.decision === "pin_focus" && !inFocusSlot) {
    return "Pinned, but every focus slot is already pinned by the manager.";
  }
  return null;
}
