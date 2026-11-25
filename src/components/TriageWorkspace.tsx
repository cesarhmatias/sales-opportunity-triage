"use client";

import { CircleCheck, Columns2, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STANCE_LABEL } from "../domain/explain";
import type { NextAction, OverrideDecision } from "../domain/types";
import { TEAM, type FieldError } from "../domain/validation";
import {
  REFERENCE_DATE,
  applyManagerOverride,
  applyQualificationUpdate,
  displacedFromFocus,
  isManager,
  triageWorkspace,
  type QualificationDraft,
  type WorkspaceState,
} from "../domain/workspace";
import { EMPTY_FILTERS, filterEntries, type QueueFilters as Filters } from "../lib/queueFilters";
import type { WorkspaceStore } from "../storage/triageStorage";
import { useWorkspaceSnapshot, workspaceStore } from "../storage/useWorkspaceStore";
import { CompareModal } from "./CompareModal";
import { ProspectInspector } from "./ProspectInspector";
import { ProspectQueueCard } from "./ProspectQueueCard";
import { QueueFilters } from "./QueueFilters";
import { ROLE_LABEL, formatAcvShort, formatDate, inputClass, labelClass, secondaryButtonClass } from "./ui";

const MAX_COMPARE = 3;
const QUICK_COMPARE = ["birch", "alder"] as const;

/** `focus` moves keyboard focus to the banner (used after a save so the outcome is announced). */
type Notice = { tone: "success" | "warning"; text: string; focus: boolean };

/** Matches Tailwind's `lg` breakpoint, where the queue and inspector stack vertically below it. */
const STACKED_LAYOUT_QUERY = "(max-width: 1023.98px)";

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const MEMORY_ONLY =
  "Browser storage is unavailable, so this change is kept in memory only and will be lost when you reload.";

function newRevisionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TriageWorkspace({ store = workspaceStore }: { store?: WorkspaceStore }) {
  const snapshot = useWorkspaceSnapshot(store);
  const { state } = snapshot;
  const result = useMemo(() => triageWorkspace(state), [state]);

  const [selectedId, setSelectedId] = useState<string>("birch");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const compareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);

  // Each new notice object that asks for focus gets it, so repeated saves are announced too.
  useEffect(() => {
    if (notice?.focus) noticeRef.current?.focus();
  }, [notice]);

  const visible = filterEntries(result.entries, filters);
  const focus = visible.filter((e) => e.evaluation.inFocusSlot);
  const outside = visible.filter((e) => !e.evaluation.inFocusSlot);
  const selected = result.entries.find((e) => e.facts.id === selectedId) ?? result.entries[0];
  const comparingEntries = comparing
    ? comparing.flatMap((id) => result.entries.filter((e) => e.facts.id === id))
    : null;
  const quickCompare = QUICK_COMPARE.map((id) => result.entries.find((e) => e.facts.id === id)).filter(
    (e) => e !== undefined,
  );

  /**
   * Commits a new state, names anyone displaced from today's slots, and reports honestly
   * whether the change reached browser storage.
   */
  function commit(previous: WorkspaceState, next: WorkspaceState, prospectId: string, successText: string) {
    const displaced = displacedFromFocus(triageWorkspace(previous), triageWorkspace(next), prospectId);
    const displacedText =
      displaced.length > 0
        ? ` ${joinNames(displaced)} ${displaced.length === 1 ? "was" : "were"} displaced from today's ${result.focusSlots} focus slots.`
        : "";
    const text = `${successText}${displacedText}`;
    const persisted = store.update(() => next);
    setNotice(
      persisted ? { tone: "success", text, focus: true } : { tone: "warning", text: `${text} ${MEMORY_ONLY}`, focus: true },
    );
  }

  function handleRoleChange(actorId: string) {
    const persisted = store.update((s) => ({ ...s, actorId }));
    if (!persisted) setNotice({ tone: "warning", text: `Role switched. ${MEMORY_ONLY}`, focus: false });
  }

  function handleSelect(prospectId: string) {
    // A confirmation about one prospect shouldn't linger while inspecting another.
    if (prospectId !== selectedId) setNotice(null);
    setSelectedId(prospectId);
    // Below the lg breakpoint the inspector sits under the queue, so bring it into view.
    if (typeof window !== "undefined" && window.matchMedia?.(STACKED_LAYOUT_QUERY).matches) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false;
      inspectorRef.current?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function handleReset() {
    const persisted = store.reset();
    setCompareIds([]);
    setResetCount((n) => n + 1);
    setNotice(
      persisted
        ? {
            tone: "success",
            text: "Seeded cases restored. Saved changes, next actions and overrides were cleared.",
            focus: false,
          }
        : { tone: "warning", text: `Seeded cases restored. ${MEMORY_ONLY}`, focus: false },
    );
  }

  function handleSaveQualification(
    prospectId: string,
    draft: QualificationDraft,
    reason: string,
    nextAction: NextAction,
  ): FieldError[] {
    const current = store.getSnapshot().state;
    const outcome = applyQualificationUpdate(current, {
      prospectId,
      draft,
      reason,
      nextAction,
      actorId: current.actorId,
      at: new Date().toISOString(),
      revisionId: newRevisionId(),
    });
    if (!outcome.ok) {
      setNotice(null); // never leave an earlier "Saved" banner above a "Not saved" error
      return outcome.errors;
    }
    const { after } = outcome.revision;
    const company = current.prospects.find((p) => p.id === prospectId)?.company ?? prospectId;
    commit(
      current,
      outcome.state,
      prospectId,
      `Saved ${company}: now #${after.rank}, ${after.score === null ? "gated" : `${after.score} pts`}, ${STANCE_LABEL[after.stance]}.`,
    );
    return [];
  }

  function handleApplyOverride(prospectId: string, decision: OverrideDecision | null, reason: string): FieldError[] {
    const current = store.getSnapshot().state;
    const outcome = applyManagerOverride(current, {
      prospectId,
      decision,
      reason,
      actorId: current.actorId,
      at: new Date().toISOString(),
      revisionId: newRevisionId(),
    });
    if (!outcome.ok) {
      setNotice(null);
      return outcome.errors;
    }
    const { after } = outcome.revision;
    const company = current.prospects.find((p) => p.id === prospectId)?.company ?? prospectId;
    commit(
      current,
      outcome.state,
      prospectId,
      `Override ${decision === null ? "cleared" : "applied"} for ${company}: now #${after.rank}, ${STANCE_LABEL[after.stance]}.`,
    );
    return [];
  }

  function handleToggleCompare(prospectId: string, checked: boolean) {
    setCompareIds((ids) =>
      checked ? (ids.includes(prospectId) ? ids : [...ids, prospectId].slice(0, MAX_COMPARE)) : ids.filter((id) => id !== prospectId),
    );
  }

  function openCompare(ids: string[], trigger: HTMLButtonElement) {
    compareTriggerRef.current = trigger;
    setComparing(ids);
  }

  function handleCompareClosed() {
    setComparing(null);
    compareTriggerRef.current?.focus();
  }

  const loadWarning =
    snapshot.loadNotice === "storage_unavailable"
      ? `Browser storage is blocked or unavailable. Changes are kept in memory only and will be lost when you reload.`
      : snapshot.loadNotice === "invalid_data_replaced"
        ? "Saved data could not be read (unknown version or invalid shape), so the seeded cases were loaded instead."
        : null;

  const renderQueue = (title: string, id: string, description: string, entries: typeof visible) => (
    <section aria-labelledby={id} className="space-y-2">
      <div>
        <h3 id={id} className="text-sm font-semibold text-slate-900">
          {title} <span className="font-normal text-slate-500">({entries.length})</span>
        </h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No prospects in this group match the current filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <ProspectQueueCard
              key={entry.facts.id}
              entry={entry}
              selected={entry.facts.id === selected.facts.id}
              onSelect={handleSelect}
              compareChecked={compareIds.includes(entry.facts.id)}
              compareDisabled={compareIds.length >= MAX_COMPARE}
              onToggleCompare={handleToggleCompare}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Sales Opportunity Triage</h1>
            <p className="text-sm text-slate-600">
              Reference date {formatDate(REFERENCE_DATE)} · {result.focusSlots} rep focus slots today · Scores allocate time,
              they don&rsquo;t predict wins
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="simulated-role" className={labelClass}>
                Simulated role
              </label>
              <select
                id="simulated-role"
                className={`${inputClass} min-w-64`}
                value={state.actorId}
                onChange={(event) => handleRoleChange(event.target.value)}
              >
                {TEAM.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} - {ROLE_LABEL[member.role]}
                  </option>
                ))}
              </select>
            </div>
            {quickCompare.length === 2 && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={(event) => openCompare([...QUICK_COMPARE], event.currentTarget)}
              >
                <Columns2 aria-hidden="true" className="size-4" />
                Compare {quickCompare[0].facts.company} ({formatAcvShort(quickCompare[0].facts.potentialAcvUsd)}) vs.{" "}
                {quickCompare[1].facts.company} ({formatAcvShort(quickCompare[1].facts.potentialAcvUsd)})
              </button>
            )}
            <button type="button" className={secondaryButtonClass} onClick={handleReset}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Reset seeded cases
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-3 px-4 pt-4 sm:px-6" aria-live="polite">
        {loadWarning && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {loadWarning}
          </p>
        )}
        {snapshot.persistence === "memory_only" && !loadWarning && notice?.tone !== "warning" && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            The last change could not be written to browser storage. It is in memory only and will be lost when you reload.
          </p>
        )}
        {notice && (
          <div
            ref={noticeRef}
            tabIndex={-1}
            role="status"
            data-testid="save-banner"
            data-tone={notice.tone}
            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              notice.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {notice.tone === "success" ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <TriangleAlert
                aria-hidden="true"
                data-testid="warning-icon"
                className="mt-0.5 size-4 shrink-0 text-amber-600"
              />
            )}
            <p>{notice.text}</p>
          </div>
        )}
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <section aria-labelledby="queue-heading" className="space-y-4">
          <h2 id="queue-heading" className="sr-only">
            Prospect queue
          </h2>
          <QueueFilters filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />

          <div className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
            <span className="text-slate-600" id="compare-count">
              {compareIds.length === 0
                ? "Tick Compare on 2–3 prospects to compare them."
                : `${compareIds.length} selected for comparison${compareIds.length >= MAX_COMPARE ? " (max)" : ""}`}
            </span>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={compareIds.length < 2}
              aria-describedby="compare-count"
              onClick={(event) => openCompare(compareIds, event.currentTarget)}
            >
              Compare selected
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="font-medium text-slate-900">No prospects match these filters.</p>
              <p className="mt-1 text-sm text-slate-600">
                Try a broader timeline or decision-maker status. Filters only hide cards; they never change today&rsquo;s
                allocation.
              </p>
              <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              {renderQueue(
                `Today's Focus Allocation (${result.focusSlots} Rep Slots)`,
                "focus-heading",
                "Prospects holding one of today's slots. Work these first.",
                focus,
              )}
              {renderQueue(
                "Outside Today's Slots",
                "outside-heading",
                "Eligible prospects queued for the next opening, then gated prospects.",
                outside,
              )}
            </>
          )}
        </section>

        <div ref={inspectorRef} className="scroll-mt-4">
          {selected && (
            <ProspectInspector
              key={`${selected.facts.id}:${resetCount}`}
              entry={selected}
              state={state}
              focusSlots={result.focusSlots}
              actorId={state.actorId}
              canOverride={isManager(state.actorId)}
              onSaveQualification={handleSaveQualification}
              onApplyOverride={handleApplyOverride}
              onSwitchRole={handleRoleChange}
            />
          )}
        </div>
      </main>

      <CompareModal entries={comparingEntries} onClose={handleCompareClosed} />
    </div>
  );
}
