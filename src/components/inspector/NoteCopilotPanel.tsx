"use client";

import { ArrowRight, ChevronRight, FileText, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  MAX_NOTE_CHARS,
  apiErrorSchema,
  extractNoteResponseSchema,
  type ExtractNoteRequest,
  type ExtractNoteResponse,
} from "../../ai/noteIntakeContract";
import { describeRetry, formatMovement, previewChanges } from "../../ai/notePreview";
import { SAMPLE_NOTES } from "../../ai/sampleNotes";
import { STANCE_LABEL } from "../../domain/explain";
import type { TriageEntry } from "../../domain/types";
import type { WorkspaceState } from "../../domain/workspace";
import { formatDate, hintClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass, teamMemberLabel } from "../ui";

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
  "Live note extraction isn't configured on this deployment (no ANTHROPIC_API_KEY), so nothing was sent to Claude. Use the manual form right below.";

const MISCONFIGURED_MESSAGE =
  "Live note extraction is misconfigured on this deployment: the server's Anthropic API key or model was rejected, so nothing was extracted. Use the manual form right below.";

const rateLimitedMessage = (retryAfter: string | null) =>
  `Rate limit reached (15 extractions per 5 minutes per network).${
    retryAfter ? ` Try again in ${retryAfter}s,` : " Try again shortly,"
  } or use the manual form right below.`;

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
      const code = error.success ? error.data.code : `HTTP_${response.status}`;
      const message =
        code === "LLM_UNAVAILABLE"
          ? UNAVAILABLE_MESSAGE
          : code === "LLM_MISCONFIGURED"
            ? MISCONFIGURED_MESSAGE
            : code === "RATE_LIMITED"
            ? rateLimitedMessage(response.headers.get("retry-after"))
            : error.success
              ? error.data.message
              : `Request failed (${response.status}). Use the manual form below.`;
      setStatus({ kind: "error", code, message });
    } catch {
      setStatus({ kind: "error", code: "NETWORK", message: "Couldn't reach the note copilot. Use the manual form below." });
    }
  }

  const result = status.kind === "done" ? status.result : null;
  const preview = result ? previewChanges(facts, result) : null;
  const retry = result ? describeRetry(result) : null;

  return (
    <details className="group rounded-lg border border-violet-200 bg-white shadow-sm">
      <summary className="flex list-none items-center gap-2 rounded-lg p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-violet-600" />
        <span className="font-semibold text-slate-900">Optional: Extract draft from call note with Claude + LangGraph</span>
      </summary>

      <div className="space-y-3 border-t border-violet-100 p-4 sm:p-5">
        <p className="text-sm text-slate-600">
          Paste raw notes to get a <strong>draft</strong> for the form below. Every proposed fact must quote the note verbatim
          and pass an entailment check; anything negated, hypothetical or unstated stays unchanged. Scores come from the
          prioritization rule, never from the model, and nothing is saved until you click Save.
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Sample call notes">
          {SAMPLE_NOTES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className={`${secondaryButtonClass} text-xs`}
              title={sample.description}
              onClick={() => {
                setNote(sample.text(facts.company));
                setStatus({ kind: "idle" });
              }}
            >
              <FileText aria-hidden="true" className="size-3.5" />
              {sample.label}
            </button>
          ))}
        </div>

        <form onSubmit={extract} className="space-y-2">
          <div>
            <label htmlFor={noteId} className={labelClass}>
              Call note
            </label>
            <textarea
              id={noteId}
              rows={5}
              maxLength={MAX_NOTE_CHARS}
              className={inputClass}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-describedby={`${noteId}-hint`}
            />
            <p id={`${noteId}-hint`} className={hintClass}>
              {note.length} / {MAX_NOTE_CHARS} characters. The note is sent to Claude only when you click extract.
            </p>
          </div>
          <button
            type="submit"
            className={secondaryButtonClass}
            disabled={note.trim() === "" || status.kind === "loading"}
            aria-busy={status.kind === "loading"}
          >
            <Sparkles aria-hidden="true" className="size-4" />
            {status.kind === "loading" ? "Extracting draft…" : "Extract draft with LangGraph"}
          </button>
        </form>

        <div aria-live="polite">
          {status.kind === "loading" && (
            <p className="text-sm text-slate-600">Running extract_facts → verify_entailment → simulate_impact → draft_action…</p>
          )}
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

        {result && preview && (
          <section
            aria-labelledby={`copilot-preview-${facts.id}`}
            className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4"
          >
            <h4 id={`copilot-preview-${facts.id}`} className="text-sm font-semibold text-slate-900">
              Draft preview
            </h4>

            <div>
              <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Simulated movement (triage engine)</h5>
              <p className="mt-1 text-base font-semibold text-slate-900" data-testid="copilot-movement">
                {formatMovement(result.impact)}
              </p>
              <p className="text-sm text-slate-600">
                {STANCE_LABEL[result.impact.before.stance]} → {STANCE_LABEL[result.impact.after.stance]}
                {result.impact.displaced.length > 0 &&
                  `. ${result.impact.displaced.join(" and ")} would be displaced from today's focus slots.`}
              </p>
            </div>

            <div>
              <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">LangGraph steps</h5>
              <ol className="mt-1 flex flex-wrap items-center gap-1 text-xs" aria-label="Executed graph nodes">
                {result.nodeTrace.map((step, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight aria-hidden="true" className="size-3 text-slate-400" />}
                    <code
                      className={`rounded px-1.5 py-0.5 ${
                        step.status === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {step.node}
                      {step.status !== "ok" && ` (${step.status})`}
                    </code>
                  </li>
                ))}
              </ol>
              {retry && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-900">
                  <RotateCcw aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {retry}
                </p>
              )}
              <details className="mt-2 text-sm">
                <summary className="text-slate-700">Step details</summary>
                <ol className="mt-1 space-y-1">
                  {result.nodeTrace.map((t, i) => (
                    <li key={i} className="text-slate-700">
                      <code className="text-xs">{t.node}</code> · {t.durationMs} ms — {t.summary}
                    </li>
                  ))}
                </ol>
              </details>
            </div>

            <div>
              <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Verified changes ({preview.changes.length})
              </h5>
              {preview.changes.length === 0 ? (
                <p className="mt-1 text-sm text-slate-600">No field changes: nothing was stated clearly enough to record.</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {preview.changes.map((change) => (
                    <li key={change.key} className="rounded-md border border-emerald-200 bg-white p-2 text-sm">
                      <span className="font-medium text-slate-900">{change.label}:</span> {change.from} →{" "}
                      <strong>{change.to}</strong>
                      {change.quotes.map((quote) => (
                        <blockquote key={quote} className="mt-1 border-l-2 border-emerald-400 pl-2 text-slate-600 italic">
                          &ldquo;{quote}&rdquo;
                        </blockquote>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Left unchanged</h5>
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                {preview.unchanged.map((item) => (
                  <li key={item.key}>
                    {item.text}
                    {item.rejectedBecause && (
                      <span className="block text-xs text-red-800">Proposal rejected: {item.rejectedBecause}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Drafted next action</h5>
              <p className="mt-1 text-sm text-slate-900">{result.nextAction.action.summary}</p>
              <p className="text-xs text-slate-600">
                {teamMemberLabel(result.nextAction.action.ownerId)} · follow up {formatDate(result.nextAction.action.followUpDate)} ·{" "}
                {result.nextAction.source === "model"
                  ? "passed next-action validation"
                  : "model draft failed validation; replaced by a gap template"}
              </p>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <button type="button" className={primaryButtonClass} onClick={() => onApply(result)}>
                Apply draft to form below
              </button>
              <p className={hintClass}>
                Fills the form inputs only (replacing unsaved edits there). Nothing is saved until you review and click Save.
              </p>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
