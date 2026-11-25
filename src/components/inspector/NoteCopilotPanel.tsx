"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  MAX_NOTE_CHARS,
  NOTE_FIELD_LABEL,
  apiErrorSchema,
  extractNoteResponseSchema,
  type ExtractNoteRequest,
  type ExtractNoteResponse,
  type FieldProposal,
} from "../../ai/noteIntakeContract";
import { addDays } from "../../domain/dates";
import { STANCE_LABEL } from "../../domain/explain";
import type { TriageEntry } from "../../domain/types";
import { REFERENCE_DATE, type WorkspaceState } from "../../domain/workspace";
import {
  cardClass,
  cardTitleClass,
  formatDate,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  teamMemberLabel,
} from "../ui";

interface NoteCopilotPanelProps {
  entry: TriageEntry;
  state: WorkspaceState;
  onApply: (result: ExtractNoteResponse) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "done"; result: ExtractNoteResponse };

const UNAVAILABLE_MESSAGE =
  "Live note extraction isn't configured on this deployment (no ANTHROPIC_API_KEY), so nothing was sent to a model. Use the manual form right below.";

function showValue(p: Pick<FieldProposal, "field" | "value">): string {
  if (p.field === "timelineDays" && typeof p.value === "number") {
    return `${p.value} days (decide by ${formatDate(addDays(REFERENCE_DATE, p.value))})`;
  }
  if (typeof p.value === "boolean") return p.value ? "Yes" : "No";
  return String(p.value).replace("_", " ");
}

const scoreText = (score: number | null) => (score === null ? "gated" : `${score} pts`);

export function NoteCopilotPanel({ entry, state, onApply }: NoteCopilotPanelProps) {
  const { facts } = entry;
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const noteId = `copilot-note-${facts.id}`;

  async function extract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "loading" });
    const payload: ExtractNoteRequest = {
      prospectId: facts.id,
      rawNote: note,
      prospects: state.prospects,
      overrides: state.overrides,
      actorId: state.actorId,
    };
    try {
      const response = await fetch("/api/extract-note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = extractNoteResponseSchema.safeParse(data);
        setStatus(
          parsed.success
            ? { kind: "done", result: parsed.data }
            : { kind: "error", code: "BAD_RESPONSE", message: "The copilot returned an unexpected response. Use the manual form below." },
        );
        return;
      }
      const error = apiErrorSchema.safeParse(data);
      if (error.success && error.data.code === "LLM_UNAVAILABLE") {
        setStatus({ kind: "error", code: "LLM_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
      } else {
        setStatus({
          kind: "error",
          code: error.success ? error.data.code : `HTTP_${response.status}`,
          message: error.success ? error.data.message : `Request failed (${response.status}). Use the manual form below.`,
        });
      }
    } catch {
      setStatus({ kind: "error", code: "NETWORK", message: "Couldn't reach the note copilot. Use the manual form below." });
    }
  }

  const result = status.kind === "done" ? status.result : null;

  return (
    <section aria-labelledby={`copilot-heading-${facts.id}`} className={cardClass}>
      <h3 id={`copilot-heading-${facts.id}`} className={`${cardTitleClass} flex items-center gap-1.5`}>
        <Sparkles aria-hidden="true" className="size-4 text-violet-600" />
        Optional · Call-note copilot
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Paste raw notes to get a <strong>draft</strong> for the form below. Every proposed fact must quote the note verbatim and
        pass an entailment check; anything negated, hypothetical, or unstated stays unknown. Scores still come from the
        prioritization rule, never from the model.
      </p>

      <form onSubmit={extract} className="mt-3 space-y-2">
        <div>
          <label htmlFor={noteId} className={labelClass}>
            Raw call notes
          </label>
          <textarea
            id={noteId}
            rows={4}
            maxLength={MAX_NOTE_CHARS}
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={`${noteId}-hint`}
          />
          <p id={`${noteId}-hint`} className={hintClass}>
            {note.length} / {MAX_NOTE_CHARS} characters. Notes are sent to the configured model only when you click extract.
          </p>
        </div>
        <button type="submit" className={secondaryButtonClass} disabled={note.trim() === "" || status.kind === "loading"}>
          <Sparkles aria-hidden="true" className="size-4" />
          {status.kind === "loading" ? "Extracting…" : "Extract verified draft"}
        </button>
      </form>

      <div aria-live="polite" className="mt-3">
        {status.kind === "loading" && <p className="text-sm text-slate-600">Extracting and verifying facts…</p>}
        {status.kind === "error" && (
          <p
            role="alert"
            data-code={status.code}
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
            {status.message}
          </p>
        )}
      </div>

      {result && (
        <div className="mt-2 space-y-4">
          <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-950">
            If applied and saved: {result.impact.company} #{result.impact.before.rank} → <strong>#{result.impact.after.rank}</strong>{" "}
            ({scoreText(result.impact.before.score)} → <strong>{scoreText(result.impact.after.score)}</strong>),{" "}
            {STANCE_LABEL[result.impact.after.stance]}.
            {result.impact.displaced.length > 0 &&
              ` ${result.impact.displaced.join(" and ")} would be displaced from today's focus slots.`}
          </p>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Verified facts ({result.verified.length})</h4>
            {result.verified.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">No new facts were stated clearly enough to record.</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {result.verified.map((p) => (
                  <li key={p.field} className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2 text-sm">
                    <span className="font-medium text-slate-900">{NOTE_FIELD_LABEL[p.field]}:</span> {showValue(p)}
                    <blockquote className="mt-1 border-l-2 border-emerald-400 pl-2 text-slate-600 italic">&ldquo;{p.quote}&rdquo;</blockquote>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result.rejected.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Rejected, left unknown ({result.rejected.length})</h4>
              <ul className="mt-1 space-y-2">
                {result.rejected.map((r, i) => (
                  <li key={`${r.field}-${r.attempt}-${i}`} className="rounded-md border border-red-200 bg-red-50/50 p-2 text-sm">
                    <span className="font-medium text-slate-900">{NOTE_FIELD_LABEL[r.field]}:</span> {showValue(r)}{" "}
                    <span className="text-xs text-slate-500">
                      ({r.stage === "literal" ? "quote not found in note" : "not entailed"}, attempt {r.attempt})
                    </span>
                    <p className="text-red-900">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Drafted next action</h4>
            <p className="mt-1 text-sm text-slate-900">{result.nextAction.action.summary}</p>
            <p className="text-xs text-slate-600">
              {teamMemberLabel(result.nextAction.action.ownerId)} · follow up {formatDate(result.nextAction.action.followUpDate)} ·{" "}
              {result.nextAction.source === "model"
                ? "model draft, passed next-action validation"
                : "model draft failed validation; replaced by a gap template"}
            </p>
          </div>

          <details className="text-sm">
            <summary className="font-medium text-slate-700">Graph trace ({result.nodeTrace.length} steps)</summary>
            <ol className="mt-2 space-y-1">
              {result.nodeTrace.map((t, i) => (
                <li key={i} className="text-slate-700">
                  <code className="text-xs">{t.node}</code>{" "}
                  <span className={t.status === "ok" ? "text-emerald-700" : "text-amber-700"}>{t.status}</span> ·{" "}
                  {t.durationMs} ms — {t.summary}
                </li>
              ))}
            </ol>
          </details>

          <button type="button" className={primaryButtonClass} onClick={() => onApply(result)}>
            Apply draft to the form below
          </button>
          <p className={hintClass}>Applying replaces unsaved edits in the form. Nothing is saved until you review and save it.</p>
        </div>
      )}
    </section>
  );
}
