import { describe, expect, it } from "vitest";
import { createSeedWorkspace, triageWorkspace } from "../domain/workspace";
import { EMPTY_FILTERS, filterEntries, hasActiveFilters, timelineBucket, type QueueFilters } from "./queueFilters";

const entries = triageWorkspace(createSeedWorkspace()).entries;
const ids = (filters: Partial<QueueFilters>) =>
  filterEntries(entries, { ...EMPTY_FILTERS, ...filters }).map((e) => e.facts.id);

describe("queue filters", () => {
  it("shows everything with no filters", () => {
    expect(ids({})).toEqual(["birch", "delta", "fern", "cedar", "elm", "alder"]);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("filters by allocation bucket without re-allocating slots", () => {
    expect(ids({ bucket: "focus" })).toEqual(["birch", "delta", "fern"]);
    expect(ids({ bucket: "outside" })).toEqual(["cedar", "elm"]);
    expect(ids({ bucket: "excluded" })).toEqual(["alder"]);
    // Filtering out the focus prospects never promotes Cedar.
    const cedar = filterEntries(entries, { ...EMPTY_FILTERS, fit: "apparent" })[0];
    expect(cedar.evaluation.stance).toBe("queue_next");
  });

  it("filters by fit, decision maker, timeline and case-insensitive search", () => {
    expect(ids({ fit: "strong" })).toEqual(["birch", "delta", "fern"]);
    expect(ids({ decisionMaker: "confirmed" })).toEqual(["birch"]);
    expect(ids({ timeline: "le14" })).toEqual(["birch", "fern"]);
    expect(ids({ timeline: "unknown" })).toEqual(["cedar"]);
    expect(ids({ timeline: "gt60" })).toEqual(["alder"]);
    expect(ids({ search: "  eLm " })).toEqual(["elm"]);
    expect(ids({ search: "el" })).toEqual(["delta", "elm"]);
    expect(ids({ fit: "strong", timeline: "31to60" })).toEqual([]);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "x" })).toBe(true);
  });

  it("buckets timelines at the scoring cutoffs", () => {
    expect([null, -1, 14, 15, 30, 31, 60, 61].map(timelineBucket)).toEqual([
      "unknown",
      "unknown",
      "le14",
      "15to30",
      "15to30",
      "31to60",
      "31to60",
      "gt60",
    ]);
  });
});
