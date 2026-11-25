"use client";

import { formatUsd, STANCE_LABEL } from "../domain/explain";
import type { NextAction, OverrideDecision, TriageEntry } from "../domain/types";
import type { FieldError } from "../domain/validation";
import { revisionsFor, type QualificationDraft, type WorkspaceState } from "../domain/workspace";
import { ChangeLogCard } from "./inspector/ChangeLogCard";
import { ObservedFactsCard } from "./inspector/ObservedFactsCard";
import { PrioritizationRuleCard } from "./inspector/PrioritizationRuleCard";
import { QualificationForm } from "./inspector/QualificationForm";
import { STANCE_BADGE } from "./ui";

interface ProspectInspectorProps {
  entry: TriageEntry;
  state: WorkspaceState;
  focusSlots: number;
  canOverride: boolean;
  onSaveQualification: (prospectId: string, draft: QualificationDraft, reason: string, action: NextAction) => FieldError[];
  onApplyOverride: (prospectId: string, decision: OverrideDecision | null, reason: string) => FieldError[];
}

export function ProspectInspector({
  entry,
  state,
  focusSlots,
  canOverride,
  onSaveQualification,
  onApplyOverride,
}: ProspectInspectorProps) {
  const { facts, evaluation } = entry;
  const revisions = revisionsFor(state, facts.id);
  const nextAction = state.nextActions[facts.id] ?? null;
  // Remount the forms when the prospect or its saved history changes so they reset to saved values.
  const formKey = `${facts.id}:${revisions.length}`;

  return (
    <section aria-labelledby="inspector-heading" className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="inspector-heading" className="text-xl font-semibold text-slate-900">
          {facts.company}
          <span className="ml-2 text-base font-normal text-slate-500">{formatUsd(facts.potentialAcvUsd)} potential ACV</span>
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${STANCE_BADGE[evaluation.stance]}`}>
          #{evaluation.rank} · {STANCE_LABEL[evaluation.stance]}
        </span>
      </header>

      <ObservedFactsCard entry={entry} />
      <PrioritizationRuleCard
        key={`rule-${formKey}`}
        entry={entry}
        focusSlots={focusSlots}
        canOverride={canOverride}
        onApplyOverride={(decision, reason) => onApplyOverride(facts.id, decision, reason)}
      />
      <QualificationForm
        key={`form-${formKey}`}
        entry={entry}
        state={state}
        savedNextAction={nextAction}
        onSave={(draft, reason, action) => onSaveQualification(facts.id, draft, reason, action)}
      />
      <ChangeLogCard nextAction={nextAction} revisions={revisions} />
    </section>
  );
}
