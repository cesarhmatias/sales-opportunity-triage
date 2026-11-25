"use client";

import { useState } from "react";
import type { ExtractNoteResponse } from "../ai/noteIntakeContract";
import { formatUsd, STANCE_LABEL } from "../domain/explain";
import type { NextAction, OverrideDecision, TriageEntry } from "../domain/types";
import type { FieldError } from "../domain/validation";
import { draftFromFacts, revisionsFor, type QualificationDraft, type WorkspaceState } from "../domain/workspace";
import { NoteCopilotPanel } from "./inspector/NoteCopilotPanel";
import { ChangeLogCard } from "./inspector/ChangeLogCard";
import { ObservedFactsCard } from "./inspector/ObservedFactsCard";
import { PrioritizationRuleCard } from "./inspector/PrioritizationRuleCard";
import { QualificationForm } from "./inspector/QualificationForm";
import { STANCE_BADGE } from "./ui";

interface ProspectInspectorProps {
  entry: TriageEntry;
  state: WorkspaceState;
  focusSlots: number;
  actorId: string;
  canOverride: boolean;
  onSaveQualification: (prospectId: string, draft: QualificationDraft, reason: string, action: NextAction) => FieldError[];
  onApplyOverride: (prospectId: string, decision: OverrideDecision | null, reason: string) => FieldError[];
  onSwitchRole: (actorId: string) => void;
}

export function ProspectInspector({
  entry,
  state,
  focusSlots,
  actorId,
  canOverride,
  onSaveQualification,
  onApplyOverride,
  onSwitchRole,
}: ProspectInspectorProps) {
  const { facts, evaluation } = entry;
  const revisions = revisionsFor(state, facts.id);
  const nextAction = state.nextActions[facts.id] ?? null;
  // Each form remounts (resetting to saved values) only after its own kind of save, so an
  // override or a role switch never wipes an unsaved qualification/next-action draft.
  const qualificationSaves = revisions.filter((r) => r.kind === "qualification_update").length;
  const overrideSaves = revisions.length - qualificationSaves;
  const [prefill, setPrefill] = useState<{ id: number; draft: QualificationDraft; action: NextAction } | null>(null);

  function applyCopilotDraft(result: ExtractNoteResponse) {
    setPrefill((previous) => ({
      id: (previous?.id ?? 0) + 1,
      draft: { ...draftFromFacts(facts), ...result.draftPatch },
      action: result.nextAction.action,
    }));
  }

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
        key={`rule-${facts.id}:${overrideSaves}`}
        entry={entry}
        focusSlots={focusSlots}
        actorId={actorId}
        canOverride={canOverride}
        onApplyOverride={(decision, reason) => onApplyOverride(facts.id, decision, reason)}
        onSwitchToManager={onSwitchRole}
      />
      <NoteCopilotPanel entry={entry} state={state} onApply={applyCopilotDraft} />
      <QualificationForm
        key={`form-${facts.id}:${qualificationSaves}:${prefill?.id ?? 0}`}
        entry={entry}
        state={state}
        savedNextAction={nextAction}
        prefill={prefill}
        onSave={(draft, reason, action) => {
          const errors = onSaveQualification(facts.id, draft, reason, action);
          // Once saved, the form should show saved values, not the copilot draft again.
          if (errors.length === 0) setPrefill(null);
          return errors;
        }}
      />
      <ChangeLogCard nextAction={nextAction} revisions={revisions} />
    </section>
  );
}
