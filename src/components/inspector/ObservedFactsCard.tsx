import { CircleHelp, Puzzle, ShieldX } from "lucide-react";
import { formatUsd } from "../../domain/explain";
import type { TriageEntry } from "../../domain/types";
import { BUDGET_LABEL, BUYER_LABEL, FIT_LABEL, SUPPORT_LABEL, cardClass, cardTitleClass, formatDate } from "../ui";

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-slate-500">{term}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

const unknown = <span className="font-normal text-slate-500 italic">Unknown — not stated yet</span>;

function IssueList({
  title,
  items,
  empty,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={item} className={`rounded-md px-2 py-1 text-sm ${tone}`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ObservedFactsCard({ entry }: { entry: TriageEntry }) {
  const { facts, evaluation } = entry;
  const buyer = facts.economicBuyer;

  return (
    <section aria-labelledby="facts-heading" className={cardClass}>
      <h3 id="facts-heading" className={cardTitleClass}>
        1. Observed facts
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Only what the team has heard or recorded. &ldquo;Unknown&rdquo; means nobody has stated it; nothing here is inferred.
      </p>

      <dl className="mt-3 divide-y divide-slate-100">
        <Fact term="Potential ACV">{formatUsd(facts.potentialAcvUsd)}</Fact>
        <Fact term="Workflow fit">{FIT_LABEL[facts.workflowFit]}</Fact>
        <Fact term="Economic buyer">
          {buyer.status === "unknown" ? unknown : BUYER_LABEL[buyer.status]}
          {buyer.status !== "unknown" && (
            <span className="block font-normal text-slate-600">
              {buyer.name ?? "Name not recorded"} · {buyer.title ?? "Title not recorded"}
            </span>
          )}
        </Fact>
        <Fact term="Budget">{facts.budget === "unknown" ? unknown : BUDGET_LABEL[facts.budget]}</Fact>
        <Fact term="Decision date">
          {facts.targetDecisionDate === null ? (
            unknown
          ) : (
            <>
              {formatDate(facts.targetDecisionDate)}
              <span className="block font-normal text-slate-600">
                {evaluation.daysToDecision !== null && evaluation.daysToDecision >= 0
                  ? `${evaluation.daysToDecision} days after the reference date`
                  : `Passed ${-(evaluation.daysToDecision ?? 0)} days before the reference date`}
              </span>
            </>
          )}
        </Fact>
        <Fact term="Stated requirements">
          {facts.requirements.length === 0 ? (
            <span className="font-normal text-slate-500">None stated</span>
          ) : (
            <ul>
              {facts.requirements.map((req) => (
                <li key={req.description}>
                  {req.description}{" "}
                  <span className="font-normal text-slate-600">({SUPPORT_LABEL[req.support]})</span>
                </li>
              ))}
            </ul>
          )}
        </Fact>
      </dl>

      <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
        <IssueList
          title="Missing info"
          items={evaluation.missingInfo}
          empty="Nothing missing."
          icon={<CircleHelp aria-hidden="true" className="size-4 text-sky-700" />}
          tone="bg-sky-50 text-sky-900"
        />
        <IssueList
          title="Disqualifiers"
          items={evaluation.gateReasons.map((r) => r.detail)}
          empty="None. Passes the eligibility gate."
          icon={<ShieldX aria-hidden="true" className="size-4 text-red-700" />}
          tone="bg-red-50 text-red-900"
        />
        <IssueList
          title="Scope risks"
          items={evaluation.scopeRisks}
          empty="None stated."
          icon={<Puzzle aria-hidden="true" className="size-4 text-amber-700" />}
          tone="bg-amber-50 text-amber-900"
        />
      </div>
    </section>
  );
}
