import { parseIsoDate } from "./dates";
import type { BudgetStatus, BuyerStatus } from "./types";

export type TeamRole = "manager" | "rep";

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
}

export const TEAM: readonly TeamMember[] = [
  { id: "jordan-lee", name: "Jordan Lee", role: "manager" },
  { id: "alex-rivera", name: "Alex Rivera", role: "rep" },
  { id: "sam-patel", name: "Sam Patel", role: "rep" },
];

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: FieldError[] };

function result(errors: FieldError[]): ValidationResult {
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/* ---------- Next action ---------- */

export const MIN_SUMMARY_CHARS = 12;
export const MIN_SUMMARY_DISTINCT_WORDS = 3;

/**
 * Words that carry no specifics on their own: generic contact verbs, pronouns,
 * fillers and vague timing. A summary made only of these is a placeholder.
 */
const GENERIC_WORDS = new Set([
  // contact verbs / nouns
  "follow", "followup", "up", "call", "phone", "email", "emails", "mail", "send", "check", "touch",
  "base", "reach", "out", "ping", "contact", "message", "text", "sync", "connect", "chat", "talk",
  "speak", "circle", "back", "again", "meet", "meeting", "schedule", "set", "book",
  // pronouns / determiners / prepositions
  "them", "they", "him", "her", "it", "us", "client", "prospect", "customer", "lead", "deal",
  "the", "a", "an", "to", "with", "in", "on", "and", "or", "about", "re", "for", "at", "by", "over", "some", "any",
  "thing", "things", "stuff", "something", "more", "info",
  // vague timing (concrete dates belong in followUpDate)
  "soon", "later", "asap", "today", "tomorrow", "tonight", "next", "this", "week", "month",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend",
  "morning", "afternoon", "eod",
]);

export interface NextActionInput {
  summary: string;
  ownerId: string;
  followUpDate: string;
}

export interface NextActionContext {
  /** Reference date (YYYY-MM-DD); follow-ups may not be scheduled before it. */
  today: string;
}

export function validateNextActionSummary(summary: string): string | null {
  const trimmed = summary.trim();
  if (trimmed.length === 0) return "Next action summary is required.";
  if (trimmed.length < MIN_SUMMARY_CHARS) {
    return `Next action summary must be at least ${MIN_SUMMARY_CHARS} characters.`;
  }
  const tokens = words(trimmed);
  if (new Set(tokens).size < MIN_SUMMARY_DISTINCT_WORDS) {
    return `Next action summary must use at least ${MIN_SUMMARY_DISTINCT_WORDS} distinct words.`;
  }
  if (tokens.every((t) => GENERIC_WORDS.has(t))) {
    return "Next action summary is too vague: say who, what, or which topic (e.g. \"Call Maya Lin Thursday about procurement timeline\").";
  }
  return null;
}

export function validateNextAction(input: NextActionInput, context: NextActionContext): ValidationResult {
  const errors: FieldError[] = [];

  const summaryError = validateNextActionSummary(input.summary);
  if (summaryError) errors.push({ field: "summary", message: summaryError });

  if (!TEAM.some((member) => member.id === input.ownerId)) {
    errors.push({ field: "ownerId", message: "Owner must be Jordan Lee, Alex Rivera, or Sam Patel." });
  }

  const followUp = parseIsoDate(input.followUpDate);
  const today = parseIsoDate(context.today);
  if (today === null) throw new Error(`Invalid reference date: ${context.today}`);
  if (followUp === null) {
    errors.push({ field: "followUpDate", message: "Follow-up date must be a valid date (YYYY-MM-DD)." });
  } else if (followUp < today) {
    errors.push({ field: "followUpDate", message: `Follow-up date cannot be before ${context.today}.` });
  }

  return result(errors);
}

/* ---------- Written reasons ---------- */

export const MIN_REASON_CHARS = 10;
export const MIN_REASON_WORDS = 2;

export function validateReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length === 0) return "A short written reason is required.";
  if (trimmed.length < MIN_REASON_CHARS || words(trimmed).length < MIN_REASON_WORDS) {
    return `Reason must be at least ${MIN_REASON_CHARS} characters and ${MIN_REASON_WORDS} words.`;
  }
  return null;
}

export type ConfirmationChange =
  | { field: "economicBuyer"; from: BuyerStatus; to: BuyerStatus; reason?: string | null }
  | { field: "budget"; from: BudgetStatus; to: BudgetStatus; reason?: string | null };

/** Unconfirming a previously confirmed buyer or budget requires a written reason. */
export function requiresReason(change: ConfirmationChange): boolean {
  return change.from === "confirmed" && change.to !== "confirmed";
}

export function validateConfirmationChange(change: ConfirmationChange): ValidationResult {
  if (!requiresReason(change)) return { ok: true };
  const error = validateReason(change.reason);
  return result(error ? [{ field: "reason", message: error }] : []);
}

export interface ManagerOverrideInput {
  prospectId: string;
  reason?: string | null;
}

export function validateManagerOverride(input: ManagerOverrideInput): ValidationResult {
  const errors: FieldError[] = [];
  if (input.prospectId.trim().length === 0) {
    errors.push({ field: "prospectId", message: "Override must target a prospect." });
  }
  const reasonError = validateReason(input.reason);
  if (reasonError) errors.push({ field: "reason", message: reasonError });
  return result(errors);
}
