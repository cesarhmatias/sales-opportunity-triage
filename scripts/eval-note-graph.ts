/**
 * Live eval of the call-note copilot (real Claude + LangGraph, no mocks).
 *
 *   npm run eval:notes                # all 12 cases
 *   npm run eval:notes -- --only=2,5  # a subset while iterating on prompts
 *
 * Loads .env.local the same way Next does. Needs ANTHROPIC_API_KEY; ANTHROPIC_MODEL is optional.
 * Prints a markdown summary and exits non-zero if any case fails.
 */
import { loadEnvConfig } from "@next/env";
import { NOTE_EVAL_CASES, gradeCase, toVerifiedFields, type EvalCase } from "../src/ai/eval/noteEvalCases";
import { DEFAULT_MODEL, createAnthropicLLM, runNoteIntake } from "../src/ai/noteIntakeGraph";
import type { ExtractNoteResponse } from "../src/ai/noteIntakeContract";
import { createSeedWorkspace } from "../src/domain/workspace";

const CONCURRENCY = 4;

interface Row {
  testCase: EvalCase;
  passed: boolean;
  failedChecks: string[];
  verified: string;
  attempts: number | null;
  ms: number;
  error: string | null;
  response: ExtractNoteResponse | null;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

function selectedCases(): readonly EvalCase[] {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  if (!only) return NOTE_EVAL_CASES;
  const ids = new Set(only.split(",").map(Number));
  return NOTE_EVAL_CASES.filter((c) => ids.has(c.id));
}

async function runCase(testCase: EvalCase): Promise<Row> {
  const started = Date.now();
  const llm = createAnthropicLLM();
  try {
    const response = await runNoteIntake(
      {
        prospectId: testCase.prospectId,
        rawNote: testCase.note,
        prospects: createSeedWorkspace().prospects,
        overrides: [],
        actorId: "alex-rivera",
      },
      { llm },
    );
    const fields = toVerifiedFields(response.verified);
    const outcome = gradeCase(testCase, fields);
    return {
      testCase,
      passed: outcome.passed,
      failedChecks: outcome.results.filter((r) => !r.passed).map((r) => r.description),
      verified: Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(", ") || "(none)",
      attempts: response.attempts,
      ms: Date.now() - started,
      error: null,
      response,
    };
  } catch (error) {
    return {
      testCase,
      passed: false,
      failedChecks: [],
      verified: "-",
      attempts: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message.split("\n")[0] : String(error),
      response: null,
    };
  }
}

async function runAll(cases: readonly EvalCase[]): Promise<Row[]> {
  const rows: Row[] = new Array(cases.length);
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const index = next++;
      rows[index] = await runCase(cases[index]);
      process.stderr.write(`  case ${cases[index].id}: ${rows[index].passed ? "pass" : "FAIL"} (${rows[index].ms} ms)\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));
  return rows;
}

function report(rows: Row[], model: string): string {
  const passed = rows.filter((r) => r.passed).length;
  const retried = rows.filter((r) => (r.attempts ?? 0) > 1).length;
  const lines = [
    `## Call-note copilot eval: ${passed}/${rows.length} passed`,
    "",
    `Model: \`${model}\` · Reference date: 2026-03-10 · Prospect: seeded Cedar · Cases that needed the retry loop: ${retried}`,
    "",
    "| # | Case | Expected | Verified fields | Attempts | Result | Drafted next action |",
    "|---|------|----------|-----------------|----------|--------|---------------------|",
    ...rows.map((r) =>
      [
        "",
        r.testCase.id,
        cell(r.testCase.name),
        cell(r.testCase.checks.map((c) => c.description).join(", ")),
        cell(r.verified),
        r.attempts ?? "-",
        r.passed ? "✅ pass" : `❌ fail${r.error ? ` (error: ${cell(r.error)})` : `: ${cell(r.failedChecks.join(", "))}`}`,
        r.response
          ? cell(`${r.response.nextAction.action.summary} (${r.response.nextAction.source === "model" ? "model" : "template fallback"})`)
          : "-",
        "",
      ].join(" | ").trim(),
    ),
  ];

  const failures = rows.filter((r) => !r.passed && r.response);
  if (failures.length > 0) {
    lines.push("", "### Failure details");
    for (const r of failures) {
      lines.push("", `**${r.testCase.id}. ${r.testCase.name}**: ${r.testCase.note}`);
      for (const v of r.response!.verified) lines.push(`- verified \`${v.field}=${JSON.stringify(v.value)}\` from "${v.quote}"`);
      for (const x of r.response!.rejected) {
        lines.push(`- rejected (attempt ${x.attempt}, ${x.stage}) \`${x.field}=${JSON.stringify(x.value)}\`: ${x.reason}`);
      }
    }
  }
  return lines.join("\n");
}

async function main() {
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (checked the environment and .env.local). This eval only runs live.");
    process.exit(2);
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const cases = selectedCases();
  process.stderr.write(`Running ${cases.length} case(s) against ${model}...\n`);
  const rows = await runAll(cases);
  console.log(report(rows, model));
  process.exit(rows.every((r) => r.passed) ? 0 : 1);
}

void main();
