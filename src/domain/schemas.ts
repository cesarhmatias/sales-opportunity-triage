import { z } from "zod";
import { isIsoDate } from "./dates";
import type { ManagerOverride, NextAction, ProspectFacts } from "./types";

/**
 * Runtime schemas for domain records. Shared by browser storage (validated on load)
 * and the /api/extract-note payload, so both reject the same malformed data.
 * Objects are strict: unknown keys are an error, never silently carried along.
 */

export const isoDateSchema = z.string().refine(isIsoDate, "Expected a real YYYY-MM-DD date");

const shortText = (max: number) => z.string().max(max);

export const prospectRecordSchema = z.strictObject({
  id: z.string().min(1).max(64),
  company: z.string().min(1).max(120),
  potentialAcvUsd: z.number().finite().nonnegative().max(1_000_000_000),
  workflowFit: z.enum(["strong", "apparent", "mixed", "poor"]),
  economicBuyer: z.strictObject({
    status: z.enum(["confirmed", "unknown", "no_access"]),
    name: shortText(120).nullable(),
    title: shortText(120).nullable(),
  }),
  budget: z.enum(["confirmed", "not_confirmed", "unknown"]),
  targetDecisionDate: isoDateSchema.nullable(),
  requirements: z
    .array(
      z.strictObject({
        description: shortText(300),
        support: z.enum(["supported", "custom_work", "unsupported"]),
      }),
    )
    .max(20),
});

export const nextActionSchema = z.strictObject({
  summary: shortText(500),
  ownerId: shortText(64),
  followUpDate: isoDateSchema,
});

export const managerOverrideSchema = z.strictObject({
  prospectId: z.string().min(1).max(64),
  decision: z.enum(["pin_focus", "hold_out"]),
  reason: shortText(500),
  setBy: shortText(64),
  setAt: shortText(40),
});

// Compile-time guarantees that each schema matches its domain type exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _prospect: Same<z.output<typeof prospectRecordSchema>, ProspectFacts> = true;
const _action: Same<z.output<typeof nextActionSchema>, NextAction> = true;
const _override: Same<z.output<typeof managerOverrideSchema>, ManagerOverride> = true;
void [_prospect, _action, _override];
