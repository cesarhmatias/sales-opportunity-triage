import { z } from "zod";
import { managerOverrideSchema, nextActionSchema, prospectRecordSchema } from "../domain/schemas";
import { TEAM } from "../domain/validation";

/** Shared between POST /api/extract-note and the browser panel that calls it. */

export const MAX_NOTE_CHARS = 2000;

const teamIds = TEAM.map((m) => m.id) as [string, ...string[]];

export const extractNoteRequestSchema = z.strictObject({
  prospectId: z.string().min(1).max(64),
  rawNote: z
    .string()
    .max(MAX_NOTE_CHARS, `Call notes are limited to ${MAX_NOTE_CHARS} characters.`)
    .refine((note) => note.trim().length > 0, "Paste some call notes first."),
  /** The browser holds the workspace, so it sends the current records for impact simulation. */
  prospects: z.array(prospectRecordSchema).min(1).max(50),
  overrides: z.array(managerOverrideSchema).max(50),
  actorId: z.enum(teamIds),
});

export type ExtractNoteRequest = z.infer<typeof extractNoteRequestSchema>;

/* ---------- Fields the copilot may propose ---------- */

export const NOTE_FIELDS = [
  "fit",
  "buyerStatus",
  "buyerName",
  "budgetStatus",
  "timelineDays",
  "hasUnsupportedBlocker",
  "blockerDetail",
] as const;
export type NoteField = (typeof NOTE_FIELDS)[number];

export const NOTE_FIELD_LABEL: Record<NoteField, string> = {
  fit: "Workflow fit",
  buyerStatus: "Economic buyer",
  buyerName: "Buyer name",
  budgetStatus: "Budget",
  timelineDays: "Buying timeline (days)",
  hasUnsupportedBlocker: "Unsupported workflow blocker",
  blockerDetail: "Blocker detail",
};

const proposalValue = z.union([z.string(), z.number(), z.boolean()]);

export const fieldProposalSchema = z.strictObject({
  field: z.enum(NOTE_FIELDS),
  value: proposalValue,
  quote: z.string(),
});
export type FieldProposal = z.infer<typeof fieldProposalSchema>;

export const rejectedProposalSchema = z.strictObject({
  field: z.enum(NOTE_FIELDS),
  value: proposalValue,
  quote: z.string(),
  /** "literal": quote not found in the note; "entailment": quote doesn't support the value in context. */
  stage: z.enum(["literal", "entailment"]),
  reason: z.string(),
  attempt: z.number().int(),
});
export type RejectedProposal = z.infer<typeof rejectedProposalSchema>;

const rankSnapshotSchema = z.strictObject({
  rank: z.number().int(),
  score: z.number().nullable(),
  stance: z.enum(["work_today", "queue_next", "excluded"]),
});

export const impactSummarySchema = z.strictObject({
  company: z.string(),
  before: rankSnapshotSchema,
  after: rankSnapshotSchema,
  /** Companies that lose a focus slot if the verified facts are saved. */
  displaced: z.array(z.string()),
  missingInfoAfter: z.array(z.string()),
  gateReasonsAfter: z.array(z.string()),
});
export type ImpactSummary = z.infer<typeof impactSummarySchema>;

export const draftedActionSchema = z.strictObject({
  action: nextActionSchema,
  /** "model": the LLM draft passed validateNextAction; "template": a deterministic gap-based draft replaced it. */
  source: z.enum(["model", "template"]),
  modelDraftErrors: z.array(z.string()),
});
export type DraftedAction = z.infer<typeof draftedActionSchema>;

export const traceEntrySchema = z.strictObject({
  node: z.enum(["extract_facts", "verify_entailment", "simulate_impact", "draft_action"]),
  status: z.enum(["ok", "rejected", "fallback"]),
  summary: z.string(),
  durationMs: z.number(),
});
export type TraceEntry = z.infer<typeof traceEntrySchema>;

/** Form-ready values derived only from verified fields ("" / undefined means "leave as is"). */
export const draftPatchSchema = z.strictObject({
  workflowFit: z.enum(["strong", "apparent", "mixed", "poor"]).optional(),
  buyerStatus: z.enum(["confirmed", "unknown", "no_access"]).optional(),
  buyerName: z.string().optional(),
  budget: z.enum(["confirmed", "not_confirmed", "unknown"]).optional(),
  targetDecisionDate: z.string().optional(),
  newBlocker: z.string().optional(),
});
export type DraftPatch = z.infer<typeof draftPatchSchema>;

export const extractNoteResponseSchema = z.strictObject({
  prospectId: z.string(),
  attempts: z.number().int(),
  verified: z.array(fieldProposalSchema),
  rejected: z.array(rejectedProposalSchema),
  draftPatch: draftPatchSchema,
  impact: impactSummarySchema,
  nextAction: draftedActionSchema,
  nodeTrace: z.array(traceEntrySchema),
});
export type ExtractNoteResponse = z.infer<typeof extractNoteResponseSchema>;

export const apiErrorSchema = z.object({
  code: z.enum([
    "INVALID_JSON",
    "INVALID_REQUEST",
    "UNKNOWN_PROSPECT",
    "PAYLOAD_TOO_LARGE",
    "RATE_LIMITED",
    "LLM_UNAVAILABLE",
    "LLM_MISCONFIGURED",
    "LLM_ERROR",
  ]),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
