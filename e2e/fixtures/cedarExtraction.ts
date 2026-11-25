import { extractNoteResponseSchema, type ExtractNoteResponse } from "../../src/ai/noteIntakeContract";
import recorded from "./cedar-extraction.recorded.json";

/**
 * A real /api/extract-note response, recorded from the local production build with
 * claude-sonnet-5-5 on the "Sample: buyer confirmed, 21-day window" note for Cedar.
 * Replaying it keeps the E2E copilot flow deterministic and free of token spend.
 *
 * As in the live runs, the verifier accepted every field on the first pass, so this
 * recording has no retry. The retry UI is covered by component tests with scripted data.
 * Parsed through the real schema so the recording can't drift from the contract.
 */
export const cedarExtraction: ExtractNoteResponse = extractNoteResponseSchema.parse(recorded);
