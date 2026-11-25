"use client";

import { Pin, PinOff, UserRound, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ManagerOverride, OverrideDecision } from "../../domain/types";
import { TEAM, type FieldError } from "../../domain/validation";
import {
  ROLE_LABEL,
  errorTextClass,
  formatTimestamp,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  teamMemberLabel,
  teamMemberName,
} from "../ui";

interface ManagerOverridePanelProps {
  prospectId: string;
  eligible: boolean;
  current: ManagerOverride | null;
  actorId: string;
  canOverride: boolean;
  onApply: (decision: OverrideDecision | null, reason: string) => FieldError[];
  onSwitchToManager: (managerId: string) => void;
}

const MANAGER = TEAM.find((m) => m.role === "manager")!;

function currentStatus(current: ManagerOverride | null): string {
  if (!current) return "No override. Overrides change slot allocation only; the score above never changes.";
  const what = current.decision === "pin_focus" ? "Pinned to today's focus" : "Deferred from today's focus";
  return `${what} by ${teamMemberName(current.setBy)} on ${formatTimestamp(current.setAt)}. Reason: “${current.reason}”`;
}

export function ManagerOverridePanel({
  prospectId,
  eligible,
  current,
  actorId,
  canOverride,
  onApply,
  onSwitchToManager,
}: ManagerOverridePanelProps) {
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterSwitch = useRef(false);

  // The "switch to manager" button unmounts when clicked; land focus on the controls it reveals.
  useEffect(() => {
    if (canOverride && focusAfterSwitch.current) {
      focusAfterSwitch.current = false;
      (reasonRef.current ?? headingRef.current)?.focus();
    }
  }, [canOverride]);

  const reasonId = `override-reason-${prospectId}`;
  const reasonError = errors.find((e) => e.field === "reason");
  const otherErrors = errors.filter((e) => e.field !== "reason");
  // Gated prospects can only have a stale override cleared, never a new one set.
  const canChange = eligible || current !== null;

  function apply(decision: OverrideDecision | null) {
    const result = onApply(decision, reason);
    setErrors(result);
    if (result.some((e) => e.field === "reason")) reasonRef.current?.focus();
  }

  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <h4 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-slate-800">
        Manager override
      </h4>
      <p className="mt-1 text-sm text-slate-600">{currentStatus(current)}</p>

      {!canOverride ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <p className="flex-1">
            Read-only: only the sales manager can pin or defer prospects. You&rsquo;re viewing as{" "}
            {teamMemberLabel(actorId)}.
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              focusAfterSwitch.current = true;
              onSwitchToManager(MANAGER.id);
            }}
          >
            <UserRound aria-hidden="true" className="size-4" />
            Switch to {MANAGER.name} ({ROLE_LABEL[MANAGER.role]})
          </button>
        </div>
      ) : !canChange ? (
        <p className="mt-3 text-sm text-slate-600">
          Gated prospects can&rsquo;t be pinned or deferred; the eligibility gate stays strict.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {!eligible && (
            <p className="text-sm text-slate-600">
              This prospect is now gated, so the existing override no longer applies. You can only clear it.
            </p>
          )}
          <div>
            <label htmlFor={reasonId} className={labelClass}>
              Override reason
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`${reasonId}-hint${reasonError ? ` ${reasonId}-error` : ""}`}
            />
            <p id={`${reasonId}-hint`} className={hintClass}>
              Required to pin or defer (at least 10 characters and 2 words). Optional when clearing.
            </p>
            {reasonError && (
              <p id={`${reasonId}-error`} className={errorTextClass}>
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
          <div role="group" aria-label="Override actions" className="flex flex-wrap gap-2">
            {eligible && (
              <>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={current?.decision === "pin_focus"}
                  onClick={() => apply("pin_focus")}
                >
                  <Pin aria-hidden="true" className="size-4" />
                  Pin to today&rsquo;s focus
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={current?.decision === "hold_out"}
                  onClick={() => apply("hold_out")}
                >
                  <PinOff aria-hidden="true" className="size-4" />
                  Defer from today&rsquo;s focus
                </button>
              </>
            )}
            {current && (
              <button type="button" className={secondaryButtonClass} onClick={() => apply(null)}>
                <Undo2 aria-hidden="true" className="size-4" />
                Clear override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
