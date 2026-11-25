import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { FOCUS_SLOTS, SAMPLE_REFERENCE_DATE, SEED_PROSPECTS } from "./seed";
import { acvPoints, gateReasons, timelinePoints, triage } from "./triageEngine";
import type { ProspectFacts, TriageResult } from "./types";

const AS_OF = SAMPLE_REFERENCE_DATE;

function run(prospects: readonly ProspectFacts[]): TriageResult {
  return triage(prospects, { asOf: AS_OF, focusSlots: FOCUS_SLOTS });
}

function entry(result: TriageResult, id: string) {
  const found = result.entries.find((e) => e.facts.id === id);
  if (!found) throw new Error(`No entry for ${id}`);
  return found;
}

function seed(id: string): ProspectFacts {
  const found = SEED_PROSPECTS.find((p) => p.id === id);
  if (!found) throw new Error(`No seed ${id}`);
  return structuredClone(found);
}

function withSeed(id: string, patch: (p: ProspectFacts) => void): ProspectFacts[] {
  return SEED_PROSPECTS.map((p) => {
    const copy = structuredClone(p);
    if (copy.id === id) patch(copy);
    return copy;
  });
}

function prospect(overrides: Partial<ProspectFacts> & Pick<ProspectFacts, "id">): ProspectFacts {
  return {
    company: overrides.id,
    potentialAcvUsd: 18_000,
    workflowFit: "strong",
    economicBuyer: { status: "unknown", name: null, title: null },
    budget: "unknown",
    targetDecisionDate: null,
    requirements: [],
    ...overrides,
  };
}

describe("seeded prospects (reference date 2026-03-10)", () => {
  const result = run(SEED_PROSPECTS);

  it("ranks Birch, Delta, Fern, Cedar, Elm, Alder", () => {
    expect(result.entries.map((e) => e.facts.company)).toEqual(["Birch", "Delta", "Fern", "Cedar", "Elm", "Alder"]);
    expect(result.entries.map((e) => e.evaluation.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["birch", 74, 1, "work_today"],
    ["delta", 73, 2, "work_today"],
    ["fern", 59, 3, "work_today"],
    ["cedar", 37, 4, "queue_next"],
    ["elm", 31, 5, "queue_next"],
  ] as const)("%s scores %i at #%i with stance %s", (id, total, rank, stance) => {
    const { evaluation } = entry(result, id);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.priorityScore?.total).toBe(total);
    expect(evaluation.rank).toBe(rank);
    expect(evaluation.stance).toBe(stance);
    expect(evaluation.inFocusSlot).toBe(stance === "work_today");
  });

  it("breaks down Birch's 74 as fit 40 + buyer 15 + budget 0 + timeline 15 + ACV 4", () => {
    expect(entry(result, "birch").evaluation.priorityScore).toEqual({
      workflowFit: 40,
      buyerReadiness: 15,
      budgetReadiness: 0,
      readiness: 15,
      timeline: 15,
      dealValue: 4,
      total: 74,
    });
  });

  it("gates out $120k Alder at #6 with both reasons and no score", () => {
    const { evaluation } = entry(result, "alder");
    expect(evaluation.rank).toBe(6);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.stance).toBe("excluded");
    expect(evaluation.inFocusSlot).toBe(false);
    expect(evaluation.priorityScore).toBeNull();
    expect(evaluation.gateReasons.map((r) => r.code)).toEqual(["poor_fit", "unsupported_requirement"]);
  });

  it("keeps Cedar eligible despite an unknown buyer and lists discovery gaps", () => {
    const { evaluation } = entry(result, "cedar");
    expect(evaluation.gateReasons).toEqual([]);
    expect(evaluation.daysToDecision).toBeNull();
    expect(evaluation.missingInfo).toEqual([
      "Economic buyer not identified",
      "Budget not yet discussed",
      "Decision date unknown",
    ]);
  });

  it("surfaces Elm's custom integration as a scope risk without gating it", () => {
    const { evaluation } = entry(result, "elm");
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.scopeRisks).toEqual(["Requires custom work: Custom integration"]);
  });

  it("does not invent buyer names or titles for Birch", () => {
    const birch = entry(result, "birch");
    expect(birch.facts.economicBuyer).toEqual({ status: "confirmed", name: null, title: null });
    expect(birch.evaluation.missingInfo).toContain("Economic buyer confirmed, but name/title not recorded");
  });

  it("distinguishes Fern's not-confirmed budget from an undiscussed one, at the same 0 points", () => {
    const fern = entry(result, "fern").evaluation;
    const birch = entry(result, "birch").evaluation;
    expect(fern.priorityScore?.budgetReadiness).toBe(0);
    expect(birch.priorityScore?.budgetReadiness).toBe(0);
    expect(fern.missingInfo).toContain("Budget asked about, not yet confirmed");
    expect(birch.missingInfo).toContain("Budget not yet discussed");
  });

  it("fills exactly three focus slots", () => {
    expect(result.entries.filter((e) => e.evaluation.inFocusSlot)).toHaveLength(3);
  });

  it("does not mutate the input facts", () => {
    const input = structuredClone(SEED_PROSPECTS) as ProspectFacts[];
    const snapshot = structuredClone(input);
    run(input);
    expect(input).toEqual(snapshot);
  });
});

describe("Cedar after discovery", () => {
  it("moves to #3 with 62 points when buyer and a 21-day timeline are confirmed, bumping Fern to #4", () => {
    const result = run(
      withSeed("cedar", (p) => {
        p.economicBuyer.status = "confirmed";
        p.targetDecisionDate = addDays(AS_OF, 21);
      }),
    );
    expect(result.entries.map((e) => e.facts.company)).toEqual(["Birch", "Delta", "Cedar", "Fern", "Elm", "Alder"]);

    const cedar = entry(result, "cedar").evaluation;
    expect(cedar.priorityScore?.total).toBe(62);
    expect(cedar.rank).toBe(3);
    expect(cedar.stance).toBe("work_today");

    const fern = entry(result, "fern").evaluation;
    expect(fern.priorityScore?.total).toBe(59);
    expect(fern.rank).toBe(4);
    expect(fern.stance).toBe("queue_next");
    expect(fern.inFocusSlot).toBe(false);
  });

  it("gains points (37 -> 39) when discovery reveals even a 90-day timeline", () => {
    const result = run(withSeed("cedar", (p) => (p.targetDecisionDate = addDays(AS_OF, 90))));
    expect(entry(result, "cedar").evaluation.priorityScore?.total).toBe(39);
  });
});

describe("eligibility gate", () => {
  it("gates confirmed no_access to the economic buyer", () => {
    const p = prospect({ id: "x", economicBuyer: { status: "no_access", name: null, title: null } });
    expect(gateReasons(p).map((r) => r.code)).toEqual(["no_buyer_access"]);
    const { evaluation } = entry(run([p]), "x");
    expect(evaluation.stance).toBe("excluded");
    expect(evaluation.priorityScore).toBeNull();
  });

  it("does not gate an unknown buyer", () => {
    expect(gateReasons(prospect({ id: "x" }))).toEqual([]);
  });

  it("gates poor fit even at very high ACV", () => {
    const p = prospect({ id: "x", workflowFit: "poor", potentialAcvUsd: 5_000_000 });
    expect(entry(run([p]), "x").evaluation.eligible).toBe(false);
  });

  it("gates an unsupported requirement even with strong fit", () => {
    const p = prospect({ id: "x", requirements: [{ description: "On-prem air-gapped", support: "unsupported" }] });
    expect(gateReasons(p).map((r) => r.code)).toEqual(["unsupported_requirement"]);
  });

  it("leaves slots empty rather than backfilling with gated prospects", () => {
    const result = run([
      seed("alder"),
      seed("birch"),
      prospect({ id: "blocked", economicBuyer: { status: "no_access", name: null, title: null } }),
    ]);
    expect(result.entries.map((e) => [e.facts.id, e.evaluation.stance])).toEqual([
      ["birch", "work_today"],
      ["alder", "excluded"],
      ["blocked", "excluded"],
    ]);
  });
});

describe("timeline points cutoffs", () => {
  it.each([
    [null, 0],
    [0, 15],
    [14, 15],
    [15, 10],
    [30, 10],
    [31, 6],
    [60, 6],
    [61, 2],
    [180, 2],
  ] as const)("%s days -> %i points", (days, points) => {
    expect(timelinePoints(days)).toBe(points);
  });

  it.each([
    [14, 15],
    [15, 10],
    [30, 10],
    [31, 6],
    [60, 6],
    [61, 2],
  ])("decision date %i days after the reference date scores %i in the engine", (days, points) => {
    const p = prospect({ id: "x", targetDecisionDate: addDays(AS_OF, days) });
    const { evaluation } = entry(run([p]), "x");
    expect(evaluation.daysToDecision).toBe(days);
    expect(evaluation.priorityScore?.timeline).toBe(points);
  });

  it("scores a decision date that already passed as 0 and asks to reconfirm", () => {
    const p = prospect({ id: "x", targetDecisionDate: addDays(AS_OF, -3) });
    const { evaluation } = entry(run([p]), "x");
    expect(evaluation.daysToDecision).toBe(-3);
    expect(evaluation.priorityScore?.timeline).toBe(0);
    expect(evaluation.missingInfo).toContain("Stated decision date 2026-03-07 has passed; reconfirm timeline");
  });
});

describe("ACV points cutoffs", () => {
  it.each([
    [0, 4],
    [29_999, 4],
    [30_000, 8],
    [49_999, 8],
    [50_000, 12],
    [79_999, 12],
    [80_000, 15],
    [120_000, 15],
  ])("$%i -> %i points", (acv, points) => {
    expect(acvPoints(acv)).toBe(points);
  });
});

describe("deterministic tie-break", () => {
  function orderOf(prospects: ProspectFacts[]): string[] {
    const forward = run(prospects).entries.map((e) => e.facts.id);
    const reversed = run([...prospects].reverse()).entries.map((e) => e.facts.id);
    expect(reversed).toEqual(forward);
    return forward;
  }

  it("prefers higher fit points on equal totals", () => {
    // 40 + 0 + 0 + 4 = 44 vs 25 + 15 + 0 + 4 = 44
    const strong = prospect({ id: "strong" });
    const apparent = prospect({
      id: "apparent",
      workflowFit: "apparent",
      economicBuyer: { status: "confirmed", name: null, title: null },
    });
    expect(orderOf([apparent, strong])).toEqual(["strong", "apparent"]);
  });

  it("then prefers higher readiness", () => {
    // 40 + 15 + 0 + 4 = 59 vs 40 + 0 + 15 + 4 = 59
    const ready = prospect({ id: "ready", economicBuyer: { status: "confirmed", name: null, title: null } });
    const urgent = prospect({ id: "urgent", targetDecisionDate: addDays(AS_OF, 10) });
    expect(orderOf([urgent, ready])).toEqual(["ready", "urgent"]);
  });

  it("then prefers more timeline points", () => {
    // 40 + 0 + 10 + 8 = 58 vs 40 + 0 + 6 + 12 = 58
    const sooner = prospect({ id: "sooner", targetDecisionDate: addDays(AS_OF, 20), potentialAcvUsd: 40_000 });
    const bigger = prospect({ id: "bigger", targetDecisionDate: addDays(AS_OF, 45), potentialAcvUsd: 60_000 });
    expect(orderOf([bigger, sooner])).toEqual(["sooner", "bigger"]);
  });

  it("then prefers the shorter known timeline", () => {
    // Names sort opposite to the expected order, so only the timeline rule can decide.
    const d20 = prospect({ id: "d20", company: "Zulu", targetDecisionDate: addDays(AS_OF, 20) });
    const d25 = prospect({ id: "d25", company: "Alpha", targetDecisionDate: addDays(AS_OF, 25) });
    expect(orderOf([d25, d20])).toEqual(["d20", "d25"]);
  });

  it("then prefers higher raw ACV within the same ACV band", () => {
    const acv85 = prospect({ id: "acv85", company: "Alpha", potentialAcvUsd: 85_000 });
    const acv120 = prospect({ id: "acv120", company: "Zulu", potentialAcvUsd: 120_000 });
    expect(orderOf([acv85, acv120])).toEqual(["acv120", "acv85"]);
  });

  it("finally orders by company name", () => {
    // Ids sort opposite to company names, so only the company rule can decide.
    const zeta = prospect({ id: "a", company: "Zeta" });
    const acme = prospect({ id: "z", company: "Acme" });
    expect(orderOf([zeta, acme])).toEqual(["z", "a"]);
  });
});
