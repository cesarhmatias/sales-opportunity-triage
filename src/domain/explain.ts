import type { PriorityEvaluation, ProspectFacts, Stance } from "./types";

export interface FactorExplanation {
  key: "workflowFit" | "readiness" | "timeline" | "dealValue";
  label: string;
  points: number;
  max: number;
  reason: string;
}

/** Locale-independent so server and browser render identical text. */
export function formatUsd(n: number): string {
  const digits = Math.round(Math.abs(n)).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return `${n < 0 ? "-" : ""}$${groups.join(",")}`;
}
const usd = formatUsd;

function timelineReason(days: number | null): string {
  if (days === null) return "No decision date stated yet, so no timeline points. Any date found in discovery adds points.";
  if (days < 0) return "The stated decision date has passed; reconfirm it before it earns points again.";
  if (days <= 14) return `Decision in ${days} days (14 or fewer).`;
  if (days <= 30) return `Decision in ${days} days (15–30).`;
  if (days <= 60) return `Decision in ${days} days (31–60).`;
  return `Decision in ${days} days (more than 60).`;
}

function acvReason(acv: number): string {
  if (acv >= 80_000) return `${usd(acv)} potential ACV ($80k or more).`;
  if (acv >= 50_000) return `${usd(acv)} potential ACV ($50k–$79,999).`;
  if (acv >= 30_000) return `${usd(acv)} potential ACV ($30k–$49,999).`;
  return `${usd(acv)} potential ACV (under $30k).`;
}

function readinessReason(facts: ProspectFacts): string {
  const buyer =
    facts.economicBuyer.status === "confirmed"
      ? "Economic buyer confirmed (+15)."
      : "Economic buyer not confirmed (+0).";
  const budget =
    facts.budget === "confirmed"
      ? "Budget confirmed (+15)."
      : facts.budget === "not_confirmed"
        ? "Budget asked about, not yet confirmed (+0, not a penalty)."
        : "Budget not yet discussed (+0).";
  return `${buyer} ${budget}`;
}

/** Plain-English breakdown of the prioritization score. Empty for gated prospects (they are not scored). */
export function explainFactors(facts: ProspectFacts, evaluation: PriorityEvaluation): FactorExplanation[] {
  const score = evaluation.priorityScore;
  if (!score) return [];
  return [
    {
      key: "workflowFit",
      label: "Workflow fit",
      points: score.workflowFit,
      max: 40,
      reason: `${facts.workflowFit[0].toUpperCase()}${facts.workflowFit.slice(1)} fit with the workflows we support.`,
    },
    { key: "readiness", label: "Verified readiness", points: score.readiness, max: 30, reason: readinessReason(facts) },
    {
      key: "timeline",
      label: "Buying timeline",
      points: score.timeline,
      max: 15,
      reason: timelineReason(evaluation.daysToDecision),
    },
    { key: "dealValue", label: "Deal value", points: score.dealValue, max: 15, reason: acvReason(facts.potentialAcvUsd) },
  ];
}

export const STANCE_LABEL: Record<Stance, string> = {
  work_today: "Work today",
  queue_next: "Queue next",
  excluded: "Excluded today",
};

export function explainStance(evaluation: PriorityEvaluation, focusSlots: number): string {
  const override = evaluation.override;
  if (evaluation.stance === "excluded") {
    return "Fails the eligibility gate, so it does not take a focus slot regardless of deal value.";
  }
  if (evaluation.stance === "work_today") {
    return override?.decision === "pin_focus"
      ? "Holds a focus slot because the manager pinned it."
      : `Holds one of today's ${focusSlots} focus slots by the prioritization rule.`;
  }
  if (override?.decision === "hold_out") return "Eligible, but the manager held it out of today's focus slots.";
  if (override?.decision === "pin_focus") return "Pinned, but every focus slot is already pinned.";
  return `Eligible, but ranked outside today's ${focusSlots} focus slots. Queue for the next opening.`;
}
