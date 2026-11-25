import { clientKeyFromHeaders, createRateLimiter, type RateLimiter } from "../lib/rateLimit";
import { extractNoteRequestSchema, type ApiError } from "./noteIntakeContract";
import { createAnthropicLLM, runNoteIntake, type StructuredLLM } from "./noteIntakeGraph";

/** Generous for a note payload (≤2000 chars + ≤50 prospect records), small enough to refuse junk early. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface ExtractNoteDeps {
  limiter: RateLimiter;
  /** Returns null when no API key is configured. */
  createLLM: () => StructuredLLM | null;
  now?: () => number;
}

export const defaultDeps: ExtractNoteDeps = {
  limiter: createRateLimiter({ limit: 15, windowMs: 5 * 60 * 1000 }),
  createLLM: () => (process.env.ANTHROPIC_API_KEY ? createAnthropicLLM() : null),
};

function errorResponse(status: number, body: ApiError, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export async function handleExtractNote(request: Request, deps: ExtractNoteDeps = defaultDeps): Promise<Response> {
  const limit = deps.limiter.check(clientKeyFromHeaders(request.headers), deps.now?.());
  if (!limit.allowed) {
    return errorResponse(
      429,
      { code: "RATE_LIMITED", message: `Too many note extractions. Try again in ${limit.retryAfterSeconds}s.` },
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return errorResponse(413, { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, { code: "INVALID_JSON", message: "Request body must be valid JSON." });
  }

  const parsed = extractNoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, {
      code: "INVALID_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
      issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;
  if (!input.prospects.some((p) => p.id === input.prospectId)) {
    return errorResponse(400, { code: "UNKNOWN_PROSPECT", message: `No prospect with id "${input.prospectId}".` });
  }
  if (new Set(input.prospects.map((p) => p.id)).size !== input.prospects.length) {
    return errorResponse(400, { code: "INVALID_REQUEST", message: "Prospect ids must be unique." });
  }

  // No regex/heuristic fallback: without a model, extraction is simply unavailable.
  const llm = deps.createLLM();
  if (!llm) {
    return errorResponse(503, {
      code: "LLM_UNAVAILABLE",
      message: "Live note extraction isn't configured on this deployment. Use the manual form instead.",
    });
  }

  try {
    return Response.json(await runNoteIntake(input, { llm }));
  } catch (error) {
    console.error("[extract-note] graph run failed", error instanceof Error ? error.message : error);
    return errorResponse(502, {
      code: "LLM_ERROR",
      message: "The note copilot couldn't finish. Nothing was changed; try again or use the manual form.",
    });
  }
}
