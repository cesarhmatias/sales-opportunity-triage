import { handleExtractNote } from "@/ai/extractNoteHandler";

/** POST /api/extract-note — call-note copilot. Logic lives in src/ai/extractNoteHandler.ts. */
export async function POST(request: Request): Promise<Response> {
  return handleExtractNote(request);
}
