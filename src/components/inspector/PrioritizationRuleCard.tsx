"use client";

import { explainFactors, explainStance, STANCE_LABEL } from "../../domain/explain";
import type { OverrideDecision, TriageEntry } from "../../domain/types";
import type { FieldError } from "../../domain/validation";
import { STANCE_BADGE, cardClass, cardTitleClass } from "../ui";
import { ManagerOverridePanel } from "./ManagerOverridePanel";

interface PrioritizationRuleCardProps {
  entry: TriageEntry;
  focusSlots: number;
  actorId: string;
  canOverride: boolean;
  onApplyOverride: (decision: OverrideDecision | null, reason: string) => FieldError[];
  onSwitchToManager: (managerId: string) => void;
}

export function PrioritizationRuleCard({
  entry,
  focusSlots,
  actorId,
  canOverride,
  onApplyOverride,
  onSwitchToManager,
}: PrioritizationRuleCardProps) {
  const { facts, evaluation } = entry;
  const score = evaluation.priorityScore;
  const factors = explainFactors(facts, evaluation);
  const current = evaluation.override;


  return (
    <section aria-labelledby="rule-heading" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="rule-heading" className={cardTitleClass}>
            2. Prioritization rule
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            A 0–100 score for allocating rep time today. It is not a forecast of whether the deal will close.
          </p>
        </div>
        <div className="text-right">
          {score ? (
            <p className="text-3xl font-semibold text-slate-900">
              {score.total}
              <span className="text-base font-normal text-slate-500"> / 100</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-slate-700">Not scored</p>
          )}
          <p className="text-xs text-slate-500">
            #{evaluation.rank} today
            {evaluation.ruleRank !== evaluation.rank && ` · #${evaluation.ruleRank} by rule alone`}
          </p>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STANCE_BADGE[evaluation.stance]}`}>
          {STANCE_LABEL[evaluation.stance]}
        </span>
        {explainStance(evaluation, focusSlots)}
      </p>
      {evaluation.overrideNote && <p className="mt-1 text-sm text-amber-800">{evaluation.overrideNote}</p>}

      <h4 className="mt-4 text-sm font-semibold text-slate-800">Step 1 · Eligibility gate</h4>
      {evaluation.eligible ? (
        <p className="mt-1 text-sm text-slate-600">
          Passed: workflow fit is not poor, no unsupported workflow, and the team has not confirmed it lacks access to the
          economic buyer.
        </p>
      ) : (
        <div className="mt-1 rounded-md bg-red-50 p-3 text-sm text-red-900">
          <p className="font-medium">Excluded from today&rsquo;s focus slots regardless of deal value:</p>
          <ul className="mt-1 list-disc pl-5">
            {evaluation.gateReasons.map((r) => (
              <li key={r.code + r.detail}>{r.detail}</li>
            ))}
          </ul>
        </div>
      )}

      {factors.length > 0 && (
        <>
          <h4 className="mt-4 text-sm font-semibold text-slate-800">Step 2 · Point allocation</h4>
          <ul className="mt-2 space-y-3">
            {factors.map((factor) => (
              <li key={factor.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-slate-800">{factor.label}</span>
                  <span className="tabular-nums text-slate-700">
                    {factor.points} / {factor.max} pts
                  </span>
                </div>
                <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${(factor.points / factor.max) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{factor.reason}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <ManagerOverridePanel
        prospectId={facts.id}
        eligible={evaluation.eligible}
        current={current}
        actorId={actorId}
        canOverride={canOverride}
        onApply={onApplyOverride}
        onSwitchToManager={onSwitchToManager}
      />
    </section>
  );
}
