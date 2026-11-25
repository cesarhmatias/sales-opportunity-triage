import { describe, expect, it } from "vitest";
import { explainFactors, explainStance } from "./explain";
import type { ManagerOverride, NextAction } from "./types";
import {
  applyManagerOverride,
  applyQualificationUpdate,
  createSeedWorkspace,
  draftFromFacts,
  revisionsFor,
  triageWorkspace,
  type QualificationUpdateInput,
  type WorkspaceState,
} from "./workspace";

const AT = "2026-03-10T15:00:00.000Z";
const action: NextAction = {
  summary: "Call Maya Lin Thursday about procurement timeline",
  ownerId: "alex-rivera",
  followUpDate: "2026-03-12",
};

function facts(state: WorkspaceState, id: string) {
  const found = state.prospects.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found;
}

function evaluation(state: WorkspaceState, id: string) {
  const found = triageWorkspace(state).entries.find((e) => e.facts.id === id);
  if (!found) throw new Error(id);
  return found.evaluation;
}

function order(state: WorkspaceState) {
  return triageWorkspace(state).entries.map((e) => [e.facts.id, e.evaluation.stance]);
}

function update(state: WorkspaceState, prospectId: string, patch: Partial<QualificationUpdateInput> = {}) {
  return applyQualificationUpdate(state, {
    prospectId,
    draft: draftFromFacts(facts(state, prospectId)),
    reason: "",
    nextAction: action,
    actorId: "alex-rivera",
    at: AT,
    revisionId: "r1",
    ...patch,
  });
}

function override(prospectId: string, decision: ManagerOverride["decision"]): ManagerOverride {
  return { prospectId, decision, reason: "Strategic account for Q2", setBy: "jordan-lee", setAt: AT };
}

describe("manager overrides in allocation", () => {
  it("leaves the seeded order untouched with no overrides", () => {
    const entries = triageWorkspace(createSeedWorkspace()).entries;
    expect(entries.map((e) => [e.evaluation.rank, e.evaluation.ruleRank])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
  });

  it("pins Elm into focus without changing its score; Fern moves outside", () => {
    const state = { ...createSeedWorkspace(), overrides: [override("elm", "pin_focus")] };
    expect(order(state)).toEqual([
      ["birch", "work_today"],
      ["delta", "work_today"],
      ["elm", "work_today"],
      ["fern", "queue_next"],
      ["cedar", "queue_next"],
      ["alder", "excluded"],
    ]);
    const elm = evaluation(state, "elm");
    expect(elm.priorityScore?.total).toBe(31);
    expect(elm.rank).toBe(3);
    expect(elm.ruleRank).toBe(5);
    expect(evaluation(state, "fern").rank).toBe(4);
  });

  it("holds Birch out so Cedar backfills the third slot", () => {
    const state = { ...createSeedWorkspace(), overrides: [override("birch", "hold_out")] };
    expect(order(state).slice(0, 4)).toEqual([
      ["delta", "work_today"],
      ["fern", "work_today"],
      ["cedar", "work_today"],
      ["birch", "queue_next"],
    ]);
    expect(evaluation(state, "birch").priorityScore?.total).toBe(74);
  });

  it("caps pins at the slot count and explains the leftover pin", () => {
    const state = {
      ...createSeedWorkspace(),
      overrides: ["fern", "cedar", "elm", "delta"].map((id) => override(id, "pin_focus")),
    };
    const focus = triageWorkspace(state).entries.filter((e) => e.evaluation.inFocusSlot);
    expect(focus.map((e) => e.facts.id)).toEqual(["delta", "fern", "cedar"]);
    expect(evaluation(state, "elm").overrideNote).toMatch(/already pinned/);
    expect(evaluation(state, "birch").stance).toBe("queue_next");
  });

  it("ignores an override on a gated prospect", () => {
    const state = { ...createSeedWorkspace(), overrides: [override("alder", "pin_focus")] };
    const alder = evaluation(state, "alder");
    expect(alder.stance).toBe("excluded");
    expect(alder.overrideNote).toMatch(/eligibility gate/);
  });
});

describe("applyManagerOverride", () => {
  const base = { reason: "Strategic logo for Q2 launch", at: AT, revisionId: "o1" };

  it("lets the manager pin and records an append-only revision", () => {
    const result = applyManagerOverride(createSeedWorkspace(), {
      ...base,
      prospectId: "elm",
      decision: "pin_focus",
      actorId: "jordan-lee",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision).toMatchObject({
      kind: "override_set",
      actorId: "jordan-lee",
      before: { rank: 5, score: 31, stance: "queue_next" },
      after: { rank: 3, score: 31, stance: "work_today" },
      fieldDiffs: [{ label: "Manager override", from: "No override", to: "Pinned to today's focus" }],
    });
    expect(result.state.revisions).toHaveLength(1);
  });

  it("rejects reps, gated prospects, missing reasons, and a fourth pin", () => {
    const seed = createSeedWorkspace();
    const fields = (r: ReturnType<typeof applyManagerOverride>) => (r.ok ? [] : r.errors.map((e) => e.field));

    expect(
      fields(applyManagerOverride(seed, { ...base, prospectId: "elm", decision: "pin_focus", actorId: "alex-rivera" })),
    ).toEqual(["actorId"]);
    expect(
      fields(applyManagerOverride(seed, { ...base, prospectId: "alder", decision: "pin_focus", actorId: "jordan-lee" })),
    ).toEqual(["decision"]);
    expect(
      fields(
        applyManagerOverride(seed, {
          ...base,
          reason: " ",
          prospectId: "elm",
          decision: "hold_out",
          actorId: "jordan-lee",
        }),
      ),
    ).toEqual(["reason"]);

    const full = { ...seed, overrides: ["birch", "delta", "fern"].map((id) => override(id, "pin_focus")) };
    expect(
      fields(applyManagerOverride(full, { ...base, prospectId: "elm", decision: "pin_focus", actorId: "jordan-lee" })),
    ).toEqual(["decision"]);
  });

  it("lets the manager clear a stale pin on a prospect that became gated, and frees the pin cap", () => {
    const gatedElm = {
      ...createSeedWorkspace(),
      prospects: createSeedWorkspace().prospects.map((p) => (p.id === "elm" ? { ...p, workflowFit: "poor" as const } : p)),
      overrides: ["elm", "birch", "delta"].map((id) => override(id, "pin_focus")),
    };
    // Elm's pin is ignored, so a third effective pin is still allowed.
    expect(
      applyManagerOverride(gatedElm, { ...base, prospectId: "fern", decision: "pin_focus", actorId: "jordan-lee" }).ok,
    ).toBe(true);
    const cleared = applyManagerOverride(gatedElm, {
      ...base,
      reason: "",
      prospectId: "elm",
      decision: null,
      actorId: "jordan-lee",
    });
    expect(cleared.ok && cleared.state.overrides.map((o) => o.prospectId)).toEqual(["birch", "delta"]);
  });

  it("clears an override without requiring a reason", () => {
    const state = { ...createSeedWorkspace(), overrides: [override("elm", "pin_focus")] };
    const result = applyManagerOverride(state, {
      ...base,
      reason: "",
      prospectId: "elm",
      decision: null,
      actorId: "jordan-lee",
    });
    expect(result.ok && result.state.overrides).toEqual([]);
    expect(result.ok && result.revision.kind).toBe("override_cleared");
  });
});

describe("applyQualificationUpdate", () => {
  it("records Cedar's discovery: rank/score before and after, field diffs and next action", () => {
    const seed = createSeedWorkspace();
    const draft = { ...draftFromFacts(facts(seed, "cedar")), buyerStatus: "confirmed" as const, targetDecisionDate: "2026-03-31" };
    const result = update(seed, "cedar", { draft });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.revision).toEqual({
      id: "r1",
      prospectId: "cedar",
      kind: "qualification_update",
      at: AT,
      actorId: "alex-rivera",
      reason: null,
      before: { rank: 4, ruleRank: 4, score: 37, stance: "queue_next" },
      after: { rank: 3, ruleRank: 3, score: 62, stance: "work_today" },
      fieldDiffs: [
        { field: "economicBuyer.status", label: "Economic buyer", from: "unknown", to: "confirmed" },
        { field: "targetDecisionDate", label: "Decision date", from: "not recorded", to: "2026-03-31" },
      ],
      nextAction: action,
    });
    expect(result.state.nextActions.cedar).toEqual(action);
    expect(evaluation(result.state, "fern").stance).toBe("queue_next");
  });

  it("does not invent a buyer name: blank inputs stay null", () => {
    const seed = createSeedWorkspace();
    const draft = { ...draftFromFacts(facts(seed, "cedar")), buyerStatus: "confirmed" as const, buyerName: "  " };
    const result = update(seed, "cedar", { draft });
    expect(result.ok && facts(result.state, "cedar").economicBuyer).toEqual({ status: "confirmed", name: null, title: null });
  });

  it("appends revisions and never rewrites earlier ones", () => {
    const first = update(createSeedWorkspace(), "birch", { revisionId: "r1" });
    if (!first.ok) throw new Error("first update failed");
    const firstRevision = structuredClone(first.revision);
    const second = update(first.state, "birch", { revisionId: "r2" });
    if (!second.ok) throw new Error("second update failed");
    expect(revisionsFor(second.state, "birch").map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(second.state.revisions[0]).toEqual(firstRevision);
  });

  it("requires a reason to unconfirm Birch's buyer", () => {
    const seed = createSeedWorkspace();
    const draft = { ...draftFromFacts(facts(seed, "birch")), buyerStatus: "unknown" as const };
    const rejected = update(seed, "birch", { draft });
    expect(!rejected.ok && rejected.errors.map((e) => e.field)).toEqual(["reason"]);
    expect(update(seed, "birch", { draft, reason: "Champion left the company" }).ok).toBe(true);
  });

  it("requires a valid next action and rejects impossible decision dates", () => {
    const seed = createSeedWorkspace();
    const draft = { ...draftFromFacts(facts(seed, "cedar")), targetDecisionDate: "2026-02-30" };
    const result = update(seed, "cedar", {
      draft,
      nextAction: { summary: "follow up with them soon", ownerId: "alex-rivera", followUpDate: "" },
    });
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual([
      "targetDecisionDate",
      "nextAction.summary",
      "nextAction.followUpDate",
    ]);
  });
});

describe("explanations", () => {
  it("explains Birch's factors in plain English", () => {
    const [entry] = triageWorkspace(createSeedWorkspace()).entries;
    const factors = explainFactors(entry.facts, entry.evaluation);
    expect(factors.map((f) => [f.label, f.points, f.max])).toEqual([
      ["Workflow fit", 40, 40],
      ["Verified readiness", 15, 30],
      ["Buying timeline", 15, 15],
      ["Deal value", 4, 15],
    ]);
    expect(factors[3].reason).toBe("$24,000 potential ACV (under $30k).");
    expect(explainStance(entry.evaluation, 3)).toMatch(/focus slots by the prioritization rule/);
  });

  it("gives no factor breakdown for a gated prospect", () => {
    const alder = triageWorkspace(createSeedWorkspace()).entries.at(-1)!;
    expect(explainFactors(alder.facts, alder.evaluation)).toEqual([]);
    expect(explainStance(alder.evaluation, 3)).toMatch(/eligibility gate/);
  });
});
