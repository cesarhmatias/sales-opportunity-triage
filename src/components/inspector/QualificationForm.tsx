"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isIsoDate } from "../../domain/dates";
import { STANCE_LABEL } from "../../domain/explain";
import type { BudgetStatus, BuyerStatus, NextAction, TriageEntry, WorkflowFit } from "../../domain/types";
import { TEAM, requiresReason, type FieldError } from "../../domain/validation";
import {
  REFERENCE_DATE,
  applyDraft,
  draftFromFacts,
  triageWorkspace,
  type QualificationDraft,
  type WorkspaceState,
} from "../../domain/workspace";
import {
  BUDGET_LABEL,
  BUYER_LABEL,
  FIT_LABEL,
  ROLE_LABEL,
  cardClass,
  cardTitleClass,
  errorTextClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "../ui";

interface QualificationFormProps {
  entry: TriageEntry;
  state: WorkspaceState;
  savedNextAction: NextAction | null;
  /** Values applied from the call-note copilot; the rep still reviews and saves them. */
  prefill?: { draft: QualificationDraft; action: NextAction } | null;
  onSave: (draft: QualificationDraft, reason: string, nextAction: NextAction) => FieldError[];
}

const EMPTY_ACTION: NextAction = { summary: "", ownerId: "", followUpDate: "" };

export function QualificationForm({ entry, state, savedNextAction, prefill, onSave }: QualificationFormProps) {
  const { facts, evaluation } = entry;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<QualificationDraft>(() => prefill?.draft ?? draftFromFacts(facts));
  const [reason, setReason] = useState("");
  // Untouched prospects start with a blank follow-up date so missing-date validation is visible.
  const [action, setAction] = useState<NextAction>(() => prefill?.action ?? savedNextAction ?? EMPTY_ACTION);

  // A copilot draft remounts this form; bring the rep to it so they review before saving.
  useEffect(() => {
    if (prefill) headingRef.current?.focus();
  }, [prefill]);
  const [errors, setErrors] = useState<FieldError[]>([]);

  const id = (name: string) => `qual-${facts.id}-${name}`;
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const setDraftField = <K extends keyof QualificationDraft>(key: K, value: QualificationDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setActionField = <K extends keyof NextAction>(key: K, value: NextAction[K]) =>
    setAction((a) => ({ ...a, [key]: value }));

  const reasonRequired =
    requiresReason({ field: "economicBuyer", from: facts.economicBuyer.status, to: draft.buyerStatus }) ||
    requiresReason({ field: "budget", from: facts.budget, to: draft.budget });

  const preview = useMemo(() => {
    const dateOk = draft.targetDecisionDate === "" || isIsoDate(draft.targetDecisionDate);
    if (!dateOk) return null;
    const next = { ...state, prospects: state.prospects.map((p) => (p.id === facts.id ? applyDraft(p, draft) : p)) };
    return triageWorkspace(next).entries.find((e) => e.facts.id === facts.id)?.evaluation ?? null;
  }, [state, facts.id, draft]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onSave(draft, reason, action);
    setErrors(result);
    // Field ids are derived from error fields, so focus works before the re-render marks them invalid.
    if (result.length > 0) document.getElementById(id(result[0].field))?.focus();
  }

  function describedBy(field: string, hintId?: string) {
    const ids = [hintId, errorFor(field) ? `${id(field)}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function fieldError(field: string) {
    const message = errorFor(field);
    return message ? (
      <p id={`${id(field)}-error`} className={errorTextClass}>
        {message}
      </p>
    ) : null;
  }

  const changed = (before: number | null | undefined, after: number | null | undefined) => before !== after;

  return (
    <section aria-labelledby={id("heading")} className={cardClass}>
      <h3 id={id("heading")} ref={headingRef} tabIndex={-1} className={cardTitleClass}>
        3. Record qualification change &amp; next action
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Update only what the prospect actually told you. Leave a field unknown or blank rather than guessing.
      </p>
      {prefill && (
        <p className="mt-2 rounded-md bg-violet-50 p-2 text-sm text-violet-900">
          Prefilled from call notes with verified facts only. Review every field, then save.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5">
        {errors.length > 0 && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-semibold">Not saved. Fix {errors.length === 1 ? "this issue" : `these ${errors.length} issues`}:</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Qualification</legend>
          <div>
            <label htmlFor={id("fit")} className={labelClass}>
              Workflow fit
            </label>
            <select
              id={id("fit")}
              className={inputClass}
              value={draft.workflowFit}
              onChange={(e) => setDraftField("workflowFit", e.target.value as WorkflowFit)}
            >
              {(Object.keys(FIT_LABEL) as WorkflowFit[]).map((fit) => (
                <option key={fit} value={fit}>
                  {FIT_LABEL[fit]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id("budget")} className={labelClass}>
              Budget
            </label>
            <select
              id={id("budget")}
              className={inputClass}
              value={draft.budget}
              onChange={(e) => setDraftField("budget", e.target.value as BudgetStatus)}
            >
              {(Object.keys(BUDGET_LABEL) as BudgetStatus[]).map((status) => (
                <option key={status} value={status}>
                  {BUDGET_LABEL[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id("buyer")} className={labelClass}>
              Economic buyer (decision maker)
            </label>
            <select
              id={id("buyer")}
              className={inputClass}
              value={draft.buyerStatus}
              onChange={(e) => setDraftField("buyerStatus", e.target.value as BuyerStatus)}
            >
              {(Object.keys(BUYER_LABEL) as BuyerStatus[]).map((status) => (
                <option key={status} value={status}>
                  {BUYER_LABEL[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id("targetDecisionDate")} className={labelClass}>
              Decision date
            </label>
            <input
              id={id("targetDecisionDate")}
              type="date"
              className={inputClass}
              value={draft.targetDecisionDate}
              onChange={(e) => setDraftField("targetDecisionDate", e.target.value)}
              aria-invalid={errorFor("targetDecisionDate") ? true : undefined}
              aria-describedby={describedBy("targetDecisionDate", id("date-hint"))}
            />
            <p id={id("date-hint")} className={hintClass}>
              Leave blank if the prospect hasn&rsquo;t stated one.
            </p>
            {fieldError("targetDecisionDate")}
          </div>
          <div>
            <label htmlFor={id("buyer-name")} className={labelClass}>
              Buyer name
            </label>
            <input
              id={id("buyer-name")}
              type="text"
              className={inputClass}
              value={draft.buyerName}
              onChange={(e) => setDraftField("buyerName", e.target.value)}
              aria-describedby={id("buyer-hint")}
            />
          </div>
          <div>
            <label htmlFor={id("buyer-title")} className={labelClass}>
              Buyer title
            </label>
            <input
              id={id("buyer-title")}
              type="text"
              className={inputClass}
              value={draft.buyerTitle}
              onChange={(e) => setDraftField("buyerTitle", e.target.value)}
              aria-describedby={id("buyer-hint")}
            />
          </div>
          <p id={id("buyer-hint")} className={`${hintClass} sm:col-span-2`}>
            Record a buyer name or title only if the prospect gave it. Blank stays &ldquo;not recorded&rdquo;.
          </p>
          <div className="sm:col-span-2">
            <label htmlFor={id("newBlocker")} className={labelClass}>
              New unsupported-workflow blocker (optional)
            </label>
            <input
              id={id("newBlocker")}
              type="text"
              className={inputClass}
              value={draft.newBlocker}
              onChange={(e) => setDraftField("newBlocker", e.target.value)}
              aria-describedby={id("blocker-hint")}
            />
            <p id={id("blocker-hint")} className={hintClass}>
              Only if the prospect stated it. A recorded blocker excludes the prospect from today&rsquo;s slots via the
              eligibility gate.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={id("reason")} className={labelClass}>
              Reason for change {reasonRequired ? "(required)" : "(optional)"}
            </label>
            <textarea
              id={id("reason")}
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={errorFor("reason") ? true : undefined}
              aria-describedby={describedBy("reason", id("reason-hint"))}
            />
            <p id={id("reason-hint")} className={hintClass}>
              {reasonRequired
                ? "You are unconfirming a previously confirmed buyer or budget. Say why (at least 10 characters and 2 words)."
                : "Required only when unconfirming a previously confirmed buyer or budget."}
            </p>
            {fieldError("reason")}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Next action</legend>
          <div className="sm:col-span-2">
            <label htmlFor={id("nextAction.summary")} className={labelClass}>
              Next action summary
            </label>
            <input
              id={id("nextAction.summary")}
              type="text"
              className={inputClass}
              value={action.summary}
              onChange={(e) => setActionField("summary", e.target.value)}
              aria-invalid={errorFor("nextAction.summary") ? true : undefined}
              aria-describedby={describedBy("nextAction.summary", id("summary-hint"))}
            />
            <p id={id("summary-hint")} className={hintClass}>
              Be specific about who and what, e.g. &ldquo;Call Maya Lin Thursday about procurement timeline&rdquo;. Vague
              placeholders like &ldquo;follow up&rdquo; are rejected.
            </p>
            {fieldError("nextAction.summary")}
          </div>
          <div>
            <label htmlFor={id("nextAction.ownerId")} className={labelClass}>
              Owner
            </label>
            <select
              id={id("nextAction.ownerId")}
              className={inputClass}
              value={action.ownerId}
              onChange={(e) => setActionField("ownerId", e.target.value)}
              aria-invalid={errorFor("nextAction.ownerId") ? true : undefined}
              aria-describedby={describedBy("nextAction.ownerId")}
            >
              <option value="">Select an owner</option>
              {TEAM.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({ROLE_LABEL[member.role]})
                </option>
              ))}
            </select>
            {fieldError("nextAction.ownerId")}
          </div>
          <div>
            <label htmlFor={id("nextAction.followUpDate")} className={labelClass}>
              Follow-up date
            </label>
            <input
              id={id("nextAction.followUpDate")}
              type="date"
              min={REFERENCE_DATE}
              className={inputClass}
              value={action.followUpDate}
              onChange={(e) => setActionField("followUpDate", e.target.value)}
              aria-invalid={errorFor("nextAction.followUpDate") ? true : undefined}
              aria-describedby={describedBy("nextAction.followUpDate", id("followup-hint"))}
            />
            <p id={id("followup-hint")} className={hintClass}>
              On or after the reference date, {REFERENCE_DATE}.
            </p>
            {fieldError("nextAction.followUpDate")}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600" aria-live="polite">
            {preview &&
            (changed(preview.priorityScore?.total, evaluation.priorityScore?.total) ||
              changed(preview.rank, evaluation.rank)) ? (
              <>
                If saved: <strong>{preview.priorityScore ? `${preview.priorityScore.total} pts` : "gated"}</strong>, #
                {preview.rank}, {STANCE_LABEL[preview.stance]} (now{" "}
                {evaluation.priorityScore ? `${evaluation.priorityScore.total} pts` : "gated"}, #{evaluation.rank})
              </>
            ) : (
              "Qualification edits preview their effect on score and rank here."
            )}
          </p>
          <button type="submit" className={primaryButtonClass}>
            Save change &amp; next action
          </button>
        </div>
      </form>
    </section>
  );
}
