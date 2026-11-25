import { Pin, ShieldX } from "lucide-react";
import { formatUsd, STANCE_LABEL } from "../domain/explain";
import type { TriageEntry } from "../domain/types";
import { BUYER_LABEL, FIT_LABEL, STANCE_BADGE, formatDays } from "./ui";

interface ProspectQueueCardProps {
  entry: TriageEntry;
  selected: boolean;
  onSelect: (prospectId: string) => void;
  compareChecked: boolean;
  compareDisabled: boolean;
  onToggleCompare: (prospectId: string, checked: boolean) => void;
}

export function ProspectQueueCard({
  entry,
  selected,
  onSelect,
  compareChecked,
  compareDisabled,
  onToggleCompare,
}: ProspectQueueCardProps) {
  const { facts, evaluation } = entry;
  const score = evaluation.priorityScore;
  const compareId = `compare-${facts.id}`;

  return (
    <li
      className={`flex rounded-lg border bg-white shadow-sm transition-colors ${
        selected ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(facts.id)}
        className="min-w-0 flex-1 rounded-l-lg p-3 text-left"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">#{evaluation.rank}</span>
              <span className="truncate font-semibold text-slate-900">{facts.company}</span>
            </span>
            <span className="mt-0.5 block text-sm text-slate-600">{formatUsd(facts.potentialAcvUsd)} potential ACV</span>
          </span>
          <span className="shrink-0 text-right">
            {score ? (
              <span className="block text-lg font-semibold leading-tight text-slate-900">
                {score.total}
                <span className="text-xs font-normal text-slate-500"> / 100</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
                <ShieldX aria-hidden="true" className="size-4" />
                Gated
              </span>
            )}
          </span>
        </span>

        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${STANCE_BADGE[evaluation.stance]}`}>
            {STANCE_LABEL[evaluation.stance]}
          </span>
          {evaluation.override && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800 ring-1 ring-inset ring-violet-600/30">
              <Pin aria-hidden="true" className="size-3" />
              {evaluation.override.decision === "pin_focus" ? "Manager pinned" : "Manager deferred"}
            </span>
          )}
          <span className="text-slate-600">
            {FIT_LABEL[facts.workflowFit]} fit · Buyer {BUYER_LABEL[facts.economicBuyer.status].toLowerCase()} ·{" "}
            {formatDays(evaluation.daysToDecision)}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5 rounded-r-lg border-l border-slate-200 bg-slate-50 px-3">
        <input
          id={compareId}
          type="checkbox"
          className="size-4 rounded border-slate-400"
          checked={compareChecked}
          disabled={compareDisabled && !compareChecked}
          onChange={(event) => onToggleCompare(facts.id, event.target.checked)}
        />
        <label htmlFor={compareId} className="text-xs font-medium text-slate-700">
          Compare<span className="sr-only"> {facts.company}</span>
        </label>
      </div>
    </li>
  );
}
