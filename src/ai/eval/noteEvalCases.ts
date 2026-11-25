import type { FieldProposal, NoteField } from "../noteIntakeContract";

/**
 * Hard call notes for the live copilot eval (`npm run eval:notes`). Each case lists checks
 * on the VERIFIED fields only: "undefined" means the guardrails must leave the field unchanged.
 */

export type VerifiedFields = Partial<Record<NoteField, string | number | boolean>>;

export interface Check {
  description: string;
  pass: (fields: VerifiedFields) => boolean;
}

export interface EvalCase {
  id: number;
  name: string;
  prospectId: string;
  note: string;
  checks: Check[];
}

const equals = (field: NoteField, value: string | number | boolean): Check => ({
  description: `${field}=${value}`,
  pass: (f) => f[field] === value,
});

const absent = (field: NoteField): Check => ({
  description: `${field}=undefined`,
  pass: (f) => f[field] === undefined,
});

const notEqual = (field: NoteField, value: string): Check => ({
  description: `${field}!=${value}`,
  pass: (f) => f[field] !== value,
});

const includesText = (field: NoteField, text: string): Check => ({
  description: `${field} includes "${text}"`,
  pass: (f) => typeof f[field] === "string" && (f[field] as string).includes(text),
});

const excludesText = (field: NoteField, text: string): Check => ({
  description: `${field} must not contain "${text}"`,
  pass: (f) => !(typeof f[field] === "string" && (f[field] as string).includes(text)),
});

export const NOTE_EVAL_CASES: readonly EvalCase[] = [
  {
    id: 1,
    name: "Cedar positive discovery",
    prospectId: "cedar",
    note: "15-min call with Maya Lin, VP of Operations. Maya was confirmed as final decision maker and wants to decide within 21 days. Budget hasn't been discussed with finance yet.",
    checks: [
      equals("buyerStatus", "confirmed"),
      includesText("buyerName", "Maya Lin"),
      equals("timelineDays", 21),
      absent("budgetStatus"),
      absent("fit"),
    ],
  },
  {
    id: 2,
    name: "Explicit negation",
    prospectId: "cedar",
    note: "Maya is NOT confirmed as final decision maker; her CFO decides.",
    checks: [absent("buyerStatus")],
  },
  {
    id: 3,
    name: "Curly apostrophe negation",
    prospectId: "cedar",
    note: "Maya isn’t confirmed as final decision maker yet.",
    checks: [absent("buyerStatus")],
  },
  {
    id: 4,
    name: "Open question / pending",
    prospectId: "cedar",
    note: "We still need to learn who owns final sign-off and whether budget exists.",
    checks: [absent("buyerStatus"), absent("budgetStatus")],
  },
  {
    id: 5,
    name: "Future / modal uncertainty",
    prospectId: "cedar",
    note: "Maya should be confirmed as buyer by Friday if legal agrees.",
    checks: [absent("buyerStatus")],
  },
  {
    id: 6,
    name: "Doubt on budget",
    prospectId: "cedar",
    note: "Champion said he doubts the budget is approved this quarter.",
    checks: [absent("budgetStatus")],
  },
  {
    id: 7,
    name: "Conditional timeline",
    prospectId: "cedar",
    note: "If budget gets approved next month, they might decide in 14 days.",
    checks: [absent("budgetStatus"), absent("timelineDays")],
  },
  {
    id: 8,
    name: "Negated blocker",
    prospectId: "cedar",
    note: "Good news: confirmed there is no unsupported regulated workflow required.",
    checks: [absent("hasUnsupportedBlocker"), notEqual("fit", "poor")],
  },
  {
    id: 9,
    name: "Rep task duration vs buying window",
    prospectId: "cedar",
    note: "Good intro call, I will send them the security deck in 2 days. Buying timeline is still unknown.",
    checks: [absent("timelineDays")],
  },
  {
    id: 10,
    name: "Competitor / third-party speech",
    prospectId: "cedar",
    note: "A competitor told them our tool wasn't a strong fit, we haven't evaluated workflow yet.",
    checks: [absent("fit")],
  },
  {
    id: 11,
    name: "Multi-person role attribution",
    prospectId: "cedar",
    note: "Tom Wu, Director of IT joined the intro. Later, their COO was confirmed as final decision maker.",
    checks: [equals("buyerStatus", "confirmed"), excludesText("buyerName", "Tom Wu")],
  },
  {
    id: 12,
    name: "Explicit unconfirmed budget + 14d window",
    prospectId: "cedar",
    note: "Team confirmed strong workflow fit and wants to decide within 14 days, but budget is not confirmed yet.",
    checks: [equals("fit", "strong"), equals("timelineDays", 14), equals("budgetStatus", "not_confirmed")],
  },
];

export function toVerifiedFields(verified: readonly FieldProposal[]): VerifiedFields {
  return Object.fromEntries(verified.map((p) => [p.field, p.value]));
}

export interface CaseOutcome {
  passed: boolean;
  results: { description: string; passed: boolean }[];
}

export function gradeCase(testCase: EvalCase, fields: VerifiedFields): CaseOutcome {
  const results = testCase.checks.map((check) => ({ description: check.description, passed: check.pass(fields) }));
  return { passed: results.every((r) => r.passed), results };
}
