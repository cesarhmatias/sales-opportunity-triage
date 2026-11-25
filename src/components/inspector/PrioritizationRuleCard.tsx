"use client";

import { useState } from "react";
import { explainFactors, explainStance, STANCE_LABEL } from "../../domain/explain";
import type { OverrideDecision, TriageEntry } from "../../domain/types";
import type { FieldError } from "../../domain/validation";
import {
  STANCE_BADGE,
  cardClass,
  cardTitleClass,
  errorTextClass,
  formatTimestamp,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  teamMemberName,
} from "../ui";

interface PrioritizationRuleCardProps {
  entry: TriageEntry;
  focusSlots: number;
  canOverride: boolean;
  onApplyOverride: (decision: OverrideDecision | null, reason: string) => FieldError[];
}

const OVERRIDE_CHOICES: { value: OverrideDecision | "none"; label: string; hint: string }[] = [
  { value: "none", label: "No override", hint: "Follow the prioritization rule." },
  { value: "pin_focus", label: "Pin to today's focus", hint: "Takes a focus slot even if the rule ranks it lower." },
  { value: "hold_out", label: "Hold out of today's focus", hint: "Frees its slot for the next eligible prospect." },
];

export function PrioritizationRuleCard({ entry, focusSlots, canOverride, onApplyOverride }: PrioritizationRuleCardProps) {
  const { facts, evaluation } = entry;
  const score = evaluation.priorityScore;
  const factors = explainFactors(facts, evaluation);
  const current = evaluation.override;

  const [choice, setChoice] = useState<OverrideDecision | "none">(current?.decision ?? "none");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);

  // Gated prospects can only have a stale override cleared, never a new one set.
  const overrideLocked = !canOverride || (!evaluation.eligible && !current);
  const reasonError = errors.find((e) => e.field === "reason");
  const otherErrors = errors.filter((e) => e.field !== "reason");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(onApplyOverride(choice === "none" ? null : choice, reason));
  }

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

      <form onSubmit={handleSubmit} noValidate className="mt-5 border-t border-slate-200 pt-4">
        <fieldset disabled={overrideLocked} className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">Manager override</legend>
          <p className="text-sm text-slate-600">
            {current
              ? `Current: ${current.decision === "pin_focus" ? "pinned to today's focus" : "held out of today's focus"} by ${teamMemberName(current.setBy)} on ${formatTimestamp(current.setAt)}. Reason: “${current.reason}”`
              : "No override. Overrides change slot allocation only; the score above never changes."}
          </p>
          {!canOverride && (
            <p className="text-sm text-slate-600">
              Only Jordan Lee (Sales Manager) can set overrides. Switch the simulated role to try it.
            </p>
          )}
          {canOverride && !evaluation.eligible && (
            <p className="text-sm text-slate-600">
              Gated prospects can&rsquo;t be overridden into or out of focus
              {current ? "; you can only clear the existing override." : "."}
            </p>
          )}

          <div className="space-y-2">
            {OVERRIDE_CHOICES.map((option) => {
              const id = `override-${facts.id}-${option.value}`;
              return (
                <div key={option.value} className="flex items-start gap-2">
                  <input
                    id={id}
                    type="radio"
                    name={`override-${facts.id}`}
                    value={option.value}
                    checked={choice === option.value}
                    onChange={() => setChoice(option.value)}
                    disabled={!evaluation.eligible && option.value !== "none"}
                    className="mt-0.5 size-4"
                  />
                  <label htmlFor={id} className="text-sm">
                    <span className="font-medium text-slate-800">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.hint}</span>
                  </label>
                </div>
              );
            })}
          </div>

          <div>
            <label htmlFor={`override-reason-${facts.id}`} className={labelClass}>
              Override reason
            </label>
            <textarea
              id={`override-reason-${facts.id}`}
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`override-reason-hint-${facts.id}${reasonError ? ` override-reason-error-${facts.id}` : ""}`}
            />
            <p id={`override-reason-hint-${facts.id}`} className={hintClass}>
              Required when setting an override (at least 10 characters and 2 words). Optional when clearing.
            </p>
            {reasonError && (
              <p id={`override-reason-error-${facts.id}`} className={errorTextClass}>
                {reasonError.message}
              </p>
            )}
          </div>
          {otherErrors.length > 0 && (
            <ul role="alert" className="text-sm font-medium text-red-700">
              {otherErrors.map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          )}
          <button type="submit" className={primaryButtonClass}>
            Apply override
          </button>
        </fieldset>
      </form>
    </section>
  );
}
