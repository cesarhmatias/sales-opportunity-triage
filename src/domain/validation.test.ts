import { describe, expect, it } from "vitest";
import { SAMPLE_REFERENCE_DATE } from "./seed";
import {
  validateConfirmationChange,
  validateManagerOverride,
  validateNextAction,
  validateNextActionSummary,
  type NextActionInput,
  type ValidationResult,
} from "./validation";

const context = { today: SAMPLE_REFERENCE_DATE };

const validAction: NextActionInput = {
  summary: "Call Maya Lin Thursday about procurement timeline",
  ownerId: "alex-rivera",
  followUpDate: "2026-03-12",
};

function errorFields(result: ValidationResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.field);
}

describe("next action summary", () => {
  it.each([
    "Call Maya Lin Thursday about procurement timeline",
    "Email SOC2 report to Maya Lin at Cedar",
    "Send pricing proposal to Delta",
    "Confirm budget owner with Fern",
  ])("accepts a specific action: %s", (summary) => {
    expect(validateNextActionSummary(summary)).toBeNull();
  });

  it.each([
    "",
    "   ",
    "follow up",
    "Follow up with them soon",
    "follow up with them soon",
    "  FOLLOW UP   WITH THEM SOON!!! ",
    "Follow-up with them, soon.",
    "call them",
    "Call them tomorrow",
    "Call them Saturday",
    "Ping them over the weekend",
    "send email",
    "Send an email to them",
    "check in",
    "Check in with them next week",
    "Touch base with the client",
  ])("rejects a vague placeholder: %j", (summary) => {
    expect(validateNextActionSummary(summary)).not.toBeNull();
  });

  it("requires at least 12 characters after trimming", () => {
    expect(validateNextActionSummary("Call Ann re X")).toBeNull(); // 13 chars
    expect(validateNextActionSummary("  Ping Ann X  ")).toMatch(/12 characters/);
  });

  it("requires at least 3 distinct words", () => {
    expect(validateNextActionSummary("Procurement procurement")).toMatch(/3 distinct words/);
    expect(validateNextActionSummary("Procurement procurement procurement")).toMatch(/3 distinct words/);
  });
});

describe("validateNextAction", () => {
  it("accepts a complete action", () => {
    expect(validateNextAction(validAction, context)).toEqual({ ok: true });
  });

  it.each(["jordan-lee", "alex-rivera", "sam-patel"])("accepts team owner %s", (ownerId) => {
    expect(validateNextAction({ ...validAction, ownerId }, context).ok).toBe(true);
  });

  it.each(["", "maya-lin", "Jordan Lee"])("rejects unknown owner %j", (ownerId) => {
    expect(errorFields(validateNextAction({ ...validAction, ownerId }, context))).toEqual(["ownerId"]);
  });

  it("accepts a follow-up on the reference date itself", () => {
    expect(validateNextAction({ ...validAction, followUpDate: "2026-03-10" }, context).ok).toBe(true);
  });

  it.each(["2026-03-09", "2025-12-31"])("rejects a follow-up before the reference date: %s", (followUpDate) => {
    expect(errorFields(validateNextAction({ ...validAction, followUpDate }, context))).toEqual(["followUpDate"]);
  });

  it.each(["", "2026-02-30", "2026-13-01", "03/12/2026", "2026-3-12"])(
    "rejects a missing or invalid follow-up date: %j",
    (followUpDate) => {
      expect(errorFields(validateNextAction({ ...validAction, followUpDate }, context))).toEqual(["followUpDate"]);
    },
  );

  it("reports every invalid field at once", () => {
    const result = validateNextAction({ summary: "follow up", ownerId: "nobody", followUpDate: "2026-03-01" }, context);
    expect(errorFields(result)).toEqual(["summary", "ownerId", "followUpDate"]);
  });
});

describe("confirmation changes", () => {
  it.each([
    ["economicBuyer", "confirmed", "unknown"],
    ["economicBuyer", "confirmed", "no_access"],
    ["budget", "confirmed", "not_confirmed"],
    ["budget", "confirmed", "unknown"],
  ] as const)("requires a reason when %s goes %s -> %s", (field, from, to) => {
    const change = { field, from, to } as Parameters<typeof validateConfirmationChange>[0];
    expect(errorFields(validateConfirmationChange(change))).toEqual(["reason"]);
    expect(errorFields(validateConfirmationChange({ ...change, reason: "  " }))).toEqual(["reason"]);
    expect(errorFields(validateConfirmationChange({ ...change, reason: "oops" }))).toEqual(["reason"]);
    expect(
      validateConfirmationChange({ ...change, reason: "Champion left the company last week" }).ok,
    ).toBe(true);
  });

  it("does not require a reason when confirming or staying unconfirmed", () => {
    expect(validateConfirmationChange({ field: "economicBuyer", from: "unknown", to: "confirmed" }).ok).toBe(true);
    expect(validateConfirmationChange({ field: "budget", from: "unknown", to: "not_confirmed" }).ok).toBe(true);
    expect(validateConfirmationChange({ field: "budget", from: "confirmed", to: "confirmed" }).ok).toBe(true);
  });
});

describe("manager override", () => {
  it("requires a short written reason", () => {
    expect(errorFields(validateManagerOverride({ prospectId: "elm" }))).toEqual(["reason"]);
    expect(errorFields(validateManagerOverride({ prospectId: "elm", reason: "because" }))).toEqual(["reason"]);
    expect(validateManagerOverride({ prospectId: "elm", reason: "Strategic logo for Q2 launch" }).ok).toBe(true);
  });

  it("requires a target prospect", () => {
    expect(errorFields(validateManagerOverride({ prospectId: " ", reason: "Strategic logo for Q2" }))).toEqual([
      "prospectId",
    ]);
  });
});
