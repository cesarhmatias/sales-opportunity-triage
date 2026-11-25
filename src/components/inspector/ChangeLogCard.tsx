import { History } from "lucide-react";
import { STANCE_LABEL } from "../../domain/explain";
import type { NextAction } from "../../domain/types";
import type { RankSnapshot, Revision, RevisionKind } from "../../domain/workspace";
import { cardClass, cardTitleClass, formatDate, formatTimestamp, teamMemberLabel } from "../ui";

const KIND_LABEL: Record<RevisionKind, string> = {
  qualification_update: "Qualification & next action",
  override_set: "Manager override set",
  override_cleared: "Manager override cleared",
};

const describe = (s: RankSnapshot) => `#${s.rank} · ${s.score === null ? "gated" : `${s.score} pts`} · ${STANCE_LABEL[s.stance]}`;

function NextActionDetails({ action }: { action: NextAction }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
      <dt className="text-slate-500">Summary</dt>
      <dd className="font-medium text-slate-900">{action.summary}</dd>
      <dt className="text-slate-500">Owner</dt>
      <dd className="text-slate-900">{teamMemberLabel(action.ownerId)}</dd>
      <dt className="text-slate-500">Follow-up</dt>
      <dd className="text-slate-900">{formatDate(action.followUpDate)}</dd>
    </dl>
  );
}

export function ChangeLogCard({ nextAction, revisions }: { nextAction: NextAction | null; revisions: Revision[] }) {
  const newestFirst = [...revisions].reverse();

  return (
    <section aria-labelledby="log-heading" className={cardClass}>
      <h3 id="log-heading" className={cardTitleClass}>
        4. Saved next action &amp; change log
      </h3>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-800">Current next action</h4>
        {nextAction ? (
          <NextActionDetails action={nextAction} />
        ) : (
          <p className="text-sm text-slate-600">No next action saved yet.</p>
        )}
      </div>

      <h4 className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <History aria-hidden="true" className="size-4" />
        Change log
        <span className="font-normal text-slate-500">(append-only, newest first)</span>
      </h4>
      {newestFirst.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No changes recorded for this prospect yet.</p>
      ) : (
        <ol className="mt-2 space-y-3">
          {newestFirst.map((rev) => (
            <li key={rev.id} className="rounded-md border border-slate-200 p-3">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-900">{KIND_LABEL[rev.kind]}</span>
                <span className="text-xs text-slate-500">{formatTimestamp(rev.at)}</span>
              </p>
              <p className="text-xs text-slate-600">Updated by {teamMemberLabel(rev.actorId)}</p>
              <p className="mt-2 text-sm text-slate-700">
                <span className="text-slate-500">Allocation: </span>
                {describe(rev.before)} → <strong>{describe(rev.after)}</strong>
              </p>
              {rev.fieldDiffs.length > 0 ? (
                <ul className="mt-1 text-sm text-slate-700">
                  {rev.fieldDiffs.map((d) => (
                    <li key={d.field}>
                      <span className="text-slate-500">{d.label}: </span>
                      {d.from} → <strong>{d.to}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No qualification fields changed.</p>
              )}
              {rev.reason && (
                <p className="mt-1 text-sm text-slate-700">
                  <span className="text-slate-500">Reason: </span>&ldquo;{rev.reason}&rdquo;
                </p>
              )}
              {rev.nextAction && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Next action at this save</p>
                  <NextActionDetails action={rev.nextAction} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
