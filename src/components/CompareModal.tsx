"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatUsd, STANCE_LABEL } from "../domain/explain";
import type { TriageEntry } from "../domain/types";
import { BUDGET_LABEL, BUYER_LABEL, FIT_LABEL, STANCE_BADGE, formatDate, secondaryButtonClass } from "./ui";

interface CompareModalProps {
  /** Entries to compare; null keeps the dialog closed. */
  entries: TriageEntry[] | null;
  onClose: () => void;
}

type Row = { label: string; render: (entry: TriageEntry) => React.ReactNode };

const points = (value: number | undefined, max: number) => (value === undefined ? "—" : `${value} / ${max}`);

const ROWS: Row[] = [
  {
    label: "Today's allocation",
    render: ({ evaluation }) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STANCE_BADGE[evaluation.stance]}`}>
        #{evaluation.rank} · {STANCE_LABEL[evaluation.stance]}
      </span>
    ),
  },
  {
    label: "Priority score",
    render: ({ evaluation }) => (evaluation.priorityScore ? `${evaluation.priorityScore.total} / 100` : "Not scored (gated)"),
  },
  {
    label: "Eligibility gate",
    render: ({ evaluation }) =>
      evaluation.eligible ? "Passed" : (
        <ul className="list-disc pl-4 text-red-800">
          {evaluation.gateReasons.map((r) => (
            <li key={r.code + r.detail}>{r.detail}</li>
          ))}
        </ul>
      ),
  },
  { label: "Potential ACV", render: ({ facts }) => formatUsd(facts.potentialAcvUsd) },
  {
    label: "Workflow fit",
    render: ({ facts, evaluation }) => `${FIT_LABEL[facts.workflowFit]} (${points(evaluation.priorityScore?.workflowFit, 40)})`,
  },
  {
    label: "Economic buyer",
    render: ({ facts }) => BUYER_LABEL[facts.economicBuyer.status],
  },
  { label: "Budget", render: ({ facts }) => BUDGET_LABEL[facts.budget] },
  { label: "Readiness points", render: ({ evaluation }) => points(evaluation.priorityScore?.readiness, 30) },
  {
    label: "Decision date",
    render: ({ facts, evaluation }) =>
      facts.targetDecisionDate
        ? `${formatDate(facts.targetDecisionDate)} (${points(evaluation.priorityScore?.timeline, 15)})`
        : `Unknown (${points(evaluation.priorityScore?.timeline, 15)})`,
  },
  { label: "Deal value points", render: ({ evaluation }) => points(evaluation.priorityScore?.dealValue, 15) },
  {
    label: "Missing info",
    render: ({ evaluation }) => (evaluation.missingInfo.length ? evaluation.missingInfo.join("; ") : "None"),
  },
  {
    label: "Scope risks",
    render: ({ evaluation }) => (evaluation.scopeRisks.length ? evaluation.scopeRisks.join("; ") : "None"),
  },
];

/** One-sentence takeaway: why the higher-ACV prospect does or doesn't win the slot. */
function takeaway(entries: TriageEntry[]): string | null {
  const byAcv = [...entries].sort((a, b) => b.facts.potentialAcvUsd - a.facts.potentialAcvUsd);
  const [biggest] = byAcv;
  const best = [...entries].sort((a, b) => a.evaluation.rank - b.evaluation.rank)[0];
  if (biggest === best) return null;
  if (!biggest.evaluation.eligible) {
    return `${biggest.facts.company}'s ${formatUsd(biggest.facts.potentialAcvUsd)} doesn't earn a slot: it fails the eligibility gate (${biggest.evaluation.gateReasons
      .map((r) => r.detail.toLowerCase())
      .join("; ")}). ${best.facts.company} passes the gate and earns its rank on fit, verified readiness and timeline.`;
  }
  return `${best.facts.company} outranks the larger ${biggest.facts.company} deal because deal value is capped at 15 of 100 points; fit, verified readiness and timeline carry the rest.`;
}

export function CompareModal({ entries, onClose }: CompareModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = entries !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // showModal() makes the rest of the page inert and lets Escape close the dialog.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const summary = entries ? takeaway(entries) : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="compare-heading"
      onClose={onClose}
      className="m-auto w-[min(64rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      {entries && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="compare-heading" className="text-lg font-semibold">
                Compare {entries.map((e) => e.facts.company).join(" vs. ")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Observed facts and the points each one earns. Scores allocate time today; they don&rsquo;t forecast a close.
              </p>
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => dialogRef.current?.close()}
            >
              <X aria-hidden="true" className="size-4" />
              Close
            </button>
          </div>

          {summary && <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-950">{summary}</p>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Side-by-side comparison of the selected prospects</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-44 border-b border-slate-200 py-2 pr-3 font-medium text-slate-500">
                    Attribute
                  </th>
                  {entries.map((e) => (
                    <th key={e.facts.id} scope="col" className="border-b border-slate-200 px-3 py-2 font-semibold">
                      {e.facts.company}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="align-top">
                    <th scope="row" className="border-b border-slate-100 py-2 pr-3 font-medium text-slate-600">
                      {row.label}
                    </th>
                    {entries.map((e) => (
                      <td key={e.facts.id} className="border-b border-slate-100 px-3 py-2 text-slate-800">
                        {row.render(e)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </dialog>
  );
}
