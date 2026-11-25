import type { z } from "zod";
import { createSeedWorkspace } from "../../domain/workspace";
import type { ExtractNoteRequest } from "../noteIntakeContract";
import type { StructuredCallName, StructuredLLM } from "../noteIntakeGraph";

/**
 * Deterministic model double: returns scripted outputs per call name, in order, and
 * records every prompt it received. Outputs go through the real zod schema, so a
 * script that doesn't match what the graph asks for fails loudly.
 */
export class ScriptedLLM implements StructuredLLM {
  readonly calls: { name: StructuredCallName; user: string }[] = [];

  constructor(private readonly script: Partial<Record<StructuredCallName, unknown[]>>) {}

  async invoke<S extends z.ZodType>(request: {
    name: StructuredCallName;
    schema: S;
    system: string;
    user: string;
  }): Promise<z.output<S>> {
    this.calls.push({ name: request.name, user: request.user });
    const queue = this.script[request.name];
    if (!queue || queue.length === 0) throw new Error(`No scripted response left for ${request.name}`);
    return request.schema.parse(queue.shift());
  }

  callsTo(name: StructuredCallName) {
    return this.calls.filter((c) => c.name === name);
  }
}

type Quoted<T> = { value: T; quote: string } | null;

export function extraction(fields: {
  fit?: Quoted<string>;
  buyerStatus?: Quoted<string>;
  buyerName?: Quoted<string>;
  budgetStatus?: Quoted<string>;
  timelineDays?: Quoted<number>;
  hasUnsupportedBlocker?: Quoted<boolean>;
  blockerDetail?: Quoted<string>;
}) {
  return {
    fit: null,
    buyerStatus: null,
    buyerName: null,
    budgetStatus: null,
    timelineDays: null,
    hasUnsupportedBlocker: null,
    blockerDetail: null,
    ...fields,
  };
}

export const verdicts = (...entries: [field: string, entailed: boolean, reason?: string][]) => ({
  verdicts: entries.map(([field, entailed, reason]) => ({ field, entailed, reason: reason ?? (entailed ? "Stated directly." : "Not supported.") })),
});

export function requestFor(prospectId: string, rawNote: string, actorId = "alex-rivera"): ExtractNoteRequest {
  return { prospectId, rawNote, prospects: createSeedWorkspace().prospects, overrides: [], actorId };
}
