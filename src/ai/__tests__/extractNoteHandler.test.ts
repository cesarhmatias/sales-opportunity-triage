import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../lib/rateLimit";
import { handleExtractNote, isConfigurationError, type ExtractNoteDeps } from "../extractNoteHandler";
import { MAX_NOTE_CHARS } from "../noteIntakeContract";
import type { StructuredLLM } from "../noteIntakeGraph";
import { ScriptedLLM, extraction, requestFor } from "./scriptedLLM";

const NOTE = "Intro call with Cedar. Nothing confirmed yet.";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/extract-note", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(createLLM: () => StructuredLLM | null = () => null, limit = 15): ExtractNoteDeps {
  return { limiter: createRateLimiter({ limit, windowMs: 5 * 60 * 1000 }), createLLM };
}

const okLLM = () =>
  new ScriptedLLM({
    extract_facts: [extraction({})],
    draft_action: [{ summary: "Ask Cedar who signs off on this purchase", followUpInDays: 2 }],
  });

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("POST /api/extract-note handler", () => {
  it("returns 400 INVALID_JSON for a malformed body", async () => {
    expect(await json(await handleExtractNote(post("{not json"), deps()))).toMatchObject({
      status: 400,
      body: { code: "INVALID_JSON" },
    });
  });

  it.each([
    ["an unknown top-level key", { ...requestFor("cedar", NOTE), extra: true }],
    ["a malformed prospect record", { ...requestFor("cedar", NOTE), prospects: [{ id: "cedar", company: "Cedar" }] }],
    ["an extra key inside a prospect", { ...requestFor("cedar", NOTE), prospects: [{ ...requestFor("cedar", NOTE).prospects[2], winProbability: 0.9 }] }],
    ["a note over the cap", requestFor("cedar", "x".repeat(MAX_NOTE_CHARS + 1))],
    ["a blank note", requestFor("cedar", "   ")],
    ["an unknown actor", requestFor("cedar", NOTE, "mallory")],
  ])("returns 400 INVALID_REQUEST for %s", async (_label, body) => {
    const { status, body: error } = await json(await handleExtractNote(post(body), deps(okLLM)));
    expect(status).toBe(400);
    expect(error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 UNKNOWN_PROSPECT when the prospect isn't in the payload", async () => {
    expect(await json(await handleExtractNote(post(requestFor("zeta", NOTE)), deps(okLLM)))).toMatchObject({
      status: 400,
      body: { code: "UNKNOWN_PROSPECT" },
    });
  });

  it("returns 503 LLM_UNAVAILABLE (no heuristic fallback) when no API key is configured", async () => {
    expect(await json(await handleExtractNote(post(requestFor("cedar", NOTE)), deps(() => null)))).toEqual({
      status: 503,
      body: {
        code: "LLM_UNAVAILABLE",
        message: "Live note extraction isn't configured on this deployment. Use the manual form instead.",
      },
    });
  });

  it("returns 200 with the graph result when a model is available", async () => {
    const { status, body } = await json(await handleExtractNote(post(requestFor("cedar", NOTE)), deps(okLLM)));
    expect(status).toBe(200);
    expect(body.impact).toMatchObject({ company: "Cedar", before: { rank: 4, score: 37 } });
    expect(body.nodeTrace.map((t: { node: string }) => t.node)).toEqual([
      "extract_facts",
      "verify_entailment",
      "simulate_impact",
      "draft_action",
    ]);
  });

  it("returns 502 LLM_ERROR without leaking details when the model call fails", async () => {
    const failing: StructuredLLM = {
      invoke: async () => {
        throw new Error("upstream exploded with secret details");
      },
    };
    const { status, body } = await json(await handleExtractNote(post(requestFor("cedar", NOTE)), deps(() => failing)));
    expect(status).toBe(502);
    expect(body.code).toBe("LLM_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns 503 LLM_MISCONFIGURED (not a try-again 502) when the API key is rejected", async () => {
    // Same fields the real AuthenticationError carries through ChatAnthropic.
    const authError = Object.assign(new Error('401 {"type":"error","error":{"type":"authentication_error"}}'), {
      status: 401,
      lc_error_code: "MODEL_AUTHENTICATION",
    });
    const rejectedKey: StructuredLLM = {
      invoke: async () => {
        throw authError;
      },
    };
    const { status, body } = await json(await handleExtractNote(post(requestFor("cedar", NOTE)), deps(() => rejectedKey)));
    expect(status).toBe(503);
    expect(body.code).toBe("LLM_MISCONFIGURED");
    expect(body.message).not.toMatch(/try again/i);
  });

  it.each([
    [{ status: 401 }, true],
    [{ status: 403 }, true],
    [{ status: 404 }, true],
    [{ lc_error_code: "MODEL_AUTHENTICATION" }, true],
    [{ status: 429 }, false],
    [{ status: 529 }, false],
    [new Error("socket hang up"), false],
    [null, false],
  ])("classifies %o as configuration error: %s", (error, expected) => {
    expect(isConfigurationError(error)).toBe(expected);
  });

  it("returns 413 for an oversized body", async () => {
    const huge = JSON.stringify({ ...requestFor("cedar", NOTE), padding: "x".repeat(70_000) });
    expect((await handleExtractNote(post(huge), deps())).status).toBe(413);
  });

  it("rate limits per client IP with 429 and Retry-After", async () => {
    const shared = deps(() => null, 15);
    for (let i = 0; i < 15; i++) {
      expect((await handleExtractNote(post(requestFor("cedar", NOTE)), shared)).status).toBe(503);
    }
    const limited = await handleExtractNote(post(requestFor("cedar", NOTE)), shared);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).code).toBe("RATE_LIMITED");
    // A different client is unaffected.
    const other = await handleExtractNote(post(requestFor("cedar", NOTE), { "x-forwarded-for": "198.51.100.2" }), shared);
    expect(other.status).toBe(503);
  });
});

describe("createRateLimiter", () => {
  it("allows `limit` requests per sliding window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 100).allowed).toBe(true);
    expect(limiter.check("a", 200)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(limiter.check("a", 1000).allowed).toBe(true); // first hit expired
  });

  it("evicts the least recently used key past maxKeys", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 0); // evicts "a"
    expect(limiter.check("a", 1).allowed).toBe(true);
    expect(limiter.check("c", 1).allowed).toBe(false);
  });
});
