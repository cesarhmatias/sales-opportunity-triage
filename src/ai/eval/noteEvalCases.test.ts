import { describe, expect, it } from "vitest";
import { NOTE_EVAL_CASES, gradeCase, toVerifiedFields } from "./noteEvalCases";

const byId = (id: number) => NOTE_EVAL_CASES.find((c) => c.id === id)!;

describe("note eval grader", () => {
  it("has 12 cases with unique ids and at least one check each", () => {
    expect(NOTE_EVAL_CASES.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(NOTE_EVAL_CASES.every((c) => c.checks.length > 0)).toBe(true);
  });

  it("passes the ideal output for case 1 and fails a budget hallucination", () => {
    const ideal = { buyerStatus: "confirmed", buyerName: "Maya Lin", timelineDays: 21 };
    expect(gradeCase(byId(1), ideal).passed).toBe(true);
    const outcome = gradeCase(byId(1), { ...ideal, budgetStatus: "not_confirmed" });
    expect(outcome.passed).toBe(false);
    expect(outcome.results.filter((r) => !r.passed).map((r) => r.description)).toEqual(["budgetStatus=undefined"]);
  });

  it("treats a missing buyer name as acceptable for case 11 but rejects the attendee's name", () => {
    expect(gradeCase(byId(11), { buyerStatus: "confirmed" }).passed).toBe(true);
    expect(gradeCase(byId(11), { buyerStatus: "confirmed", buyerName: "Tom Wu" }).passed).toBe(false);
    expect(gradeCase(byId(11), {}).passed).toBe(false);
  });

  it("requires every positive field in case 12 and only absence in negative cases", () => {
    expect(gradeCase(byId(12), { fit: "strong", timelineDays: 14, budgetStatus: "not_confirmed" }).passed).toBe(true);
    expect(gradeCase(byId(12), { fit: "strong", timelineDays: 14 }).passed).toBe(false);
    expect(gradeCase(byId(8), {}).passed).toBe(true);
    expect(gradeCase(byId(8), { fit: "poor" }).passed).toBe(false);
  });

  it("maps verified proposals to a field lookup", () => {
    expect(
      toVerifiedFields([
        { field: "buyerStatus", value: "confirmed", quote: "q" },
        { field: "timelineDays", value: 21, quote: "q" },
      ]),
    ).toEqual({ buyerStatus: "confirmed", timelineDays: 21 });
  });
});
