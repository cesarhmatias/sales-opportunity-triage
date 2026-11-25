// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractNoteResponse } from "../ai/noteIntakeContract";
import { createWorkspaceStore } from "../storage/triageStorage";
import { MemoryStorage } from "../test/fakeStorage";
import { TriageWorkspace } from "./TriageWorkspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderOnCedar() {
  const store = createWorkspaceStore(() => new MemoryStorage());
  render(<TriageWorkspace store={store} />);
  fireEvent.click(screen.getByRole("button", { name: /^#\d+\s*Cedar/ }));
  // Open the collapsible panel.
  fireEvent.click(screen.getByText("Optional: Extract draft from call note with Claude + LangGraph"));
  return store;
}

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const extractButton = () => screen.getByRole("button", { name: "Extract draft with LangGraph" });

function extract(note: string) {
  fireEvent.change(screen.getByLabelText("Call note"), { target: { value: note } });
  fireEvent.click(extractButton());
}

const cedarResult: ExtractNoteResponse = {
  prospectId: "cedar",
  attempts: 2,
  verified: [
    { field: "buyerStatus", value: "confirmed", quote: "confirmed she is the final decision maker for this purchase" },
    { field: "buyerName", value: "Maya Lin", quote: "Maya Lin, VP of Operations, confirmed she is the final decision maker" },
    { field: "timelineDays", value: 21, quote: "They want to make a buying decision within 21 days." },
  ],
  rejected: [
    {
      field: "budgetStatus",
      value: "not_confirmed",
      quote: "Budget hasn't been discussed with finance yet.",
      stage: "entailment",
      reason: "Not discussed is not the same as asked and not confirmed.",
      attempt: 1,
    },
  ],
  draftPatch: { buyerStatus: "confirmed", buyerName: "Maya Lin", targetDecisionDate: "2026-03-31" },
  impact: {
    company: "Cedar",
    before: { rank: 4, score: 37, stance: "queue_next" },
    after: { rank: 3, score: 62, stance: "work_today" },
    displaced: ["Fern"],
    missingInfoAfter: ["Economic buyer confirmed, but name/title not recorded", "Budget not yet discussed"],
    gateReasonsAfter: [],
  },
  nextAction: {
    action: { summary: "Ask Maya Lin to loop in finance on Cedar's budget this week", ownerId: "jordan-lee", followUpDate: "2026-03-12" },
    source: "model",
    modelDraftErrors: [],
  },
  nodeTrace: [
    { node: "extract_facts", status: "ok", summary: "Attempt 1: proposed 4 field(s).", durationMs: 5 },
    { node: "verify_entailment", status: "rejected", summary: "Attempt 1: 3 verified, 1 rejected.", durationMs: 4 },
    { node: "extract_facts", status: "ok", summary: "Attempt 2: proposed 3 field(s).", durationMs: 5 },
    { node: "verify_entailment", status: "ok", summary: "Attempt 2: 3 verified.", durationMs: 4 },
    { node: "simulate_impact", status: "ok", summary: "Cedar #4 → #3.", durationMs: 1 },
    { node: "draft_action", status: "ok", summary: "Drafted.", durationMs: 3 },
  ],
};

describe("call-note copilot panel", () => {
  it("is collapsed by default and fills the note from a sample button", () => {
    render(<TriageWorkspace store={createWorkspaceStore(() => new MemoryStorage())} />);
    const details = screen.getByText("Optional: Extract draft from call note with Claude + LangGraph").closest("details")!;
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: /^#\d+\s*Cedar/ }));
    fireEvent.click(screen.getByText("Optional: Extract draft from call note with Claude + LangGraph"));
    expect(extractButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Sample: buyer confirmed, 21-day window" }));
    const noteValue = () => (screen.getByLabelText("Call note") as HTMLTextAreaElement).value;
    expect(noteValue()).toContain("Maya Lin, VP of Operations, confirmed she is the final decision maker");
    expect(extractButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Sample: tricky note (negation & uncertainty)" }));
    expect(noteValue()).toContain("Their CFO isn't the one who signs off");
  });

  it("explains a 503 LLM_UNAVAILABLE and keeps the manual form usable", async () => {
    const fetchMock = stubFetch(503, { code: "LLM_UNAVAILABLE", message: "not configured" });
    renderOnCedar();
    extract("Spoke with their COO; budget isn't confirmed.");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-code", "LLM_UNAVAILABLE");
    expect(alert).toHaveTextContent(/isn't configured on this deployment/);
    expect(alert).toHaveTextContent(/manual form right below/);
    expect(screen.getByRole("button", { name: "Save change & next action" })).toBeEnabled();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ prospectId: "cedar", actorId: "jordan-lee" });
  });

  it("explains a rejected server key (503 LLM_MISCONFIGURED) without suggesting a retry", async () => {
    stubFetch(503, { code: "LLM_MISCONFIGURED", message: "misconfigured" });
    renderOnCedar();
    extract("Any note");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-code", "LLM_MISCONFIGURED");
    expect(alert).toHaveTextContent(/API key or model was rejected/);
    expect(alert).not.toHaveTextContent(/try again/i);
  });

  it("explains a 429 with the Retry-After wait", async () => {
    stubFetch(429, { code: "RATE_LIMITED", message: "Too many" }, { "retry-after": "42" });
    renderOnCedar();
    extract("Any note");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-code", "RATE_LIMITED");
    expect(alert).toHaveTextContent("Rate limit reached (15 extractions per 5 minutes per network). Try again in 42s");
  });

  it("previews steps (incl. retry), quoted changes, unchanged fields and movement, then applies without saving", async () => {
    stubFetch(200, cedarResult);
    const store = renderOnCedar();
    fireEvent.click(screen.getByRole("button", { name: "Sample: buyer confirmed, 21-day window" }));
    fireEvent.click(extractButton());

    const preview = within(await screen.findByRole("region", { name: "Draft preview" }));
    expect(preview.getByTestId("copilot-movement")).toHaveTextContent("Cedar: #4, 37 pts → #3, 62 pts");
    expect(preview.getByText(/Fern would be displaced/)).toBeInTheDocument();

    const steps = preview.getByRole("list", { name: "Executed graph nodes" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "extract_facts",
      "verify_entailment (rejected)",
      "extract_facts",
      "verify_entailment",
      "simulate_impact",
      "draft_action",
    ]);
    expect(preview.getByText(/Retry: verify_entailment rejected 1 field \(budgetStatus\)/)).toBeInTheDocument();

    expect(preview.getByText("Economic buyer status:").parentElement).toHaveTextContent("unknown → confirmed");
    expect(preview.getByText("“They want to make a buying decision within 21 days.”")).toBeInTheDocument();
    expect(preview.getByText("Budget status kept as unknown")).toBeInTheDocument();
    expect(preview.getByText(/Proposal rejected: Not discussed is not the same/)).toBeInTheDocument();

    fireEvent.click(preview.getByRole("button", { name: "Apply draft to form below" }));

    await waitFor(() => expect(screen.getByLabelText("Economic buyer (decision maker)")).toHaveValue("confirmed"));
    expect(screen.getByLabelText("Buyer name")).toHaveValue("Maya Lin");
    expect(screen.getByLabelText("Decision date")).toHaveValue("2026-03-31");
    expect(screen.getByLabelText("Budget")).toHaveValue("unknown");
    expect(screen.getByLabelText("Next action summary")).toHaveValue("Ask Maya Lin to loop in finance on Cedar's budget this week");
    expect(screen.getByRole("heading", { name: /Record qualification change/ })).toHaveFocus();
    // Applying never saves: no revision, Cedar still #4 with 37 in the stored state.
    expect(store.getSnapshot().state.revisions).toEqual([]);
    expect(store.getSnapshot().state.prospects.find((p) => p.id === "cedar")!.economicBuyer.status).toBe("unknown");
  });

  it("rejects a response that doesn't match the contract instead of trusting it", async () => {
    stubFetch(200, { ...cedarResult, impact: { ...cedarResult.impact, winProbability: 0.8 } });
    renderOnCedar();
    extract("Messy notes about Cedar");
    expect(await screen.findByRole("alert")).toHaveAttribute("data-code", "BAD_RESPONSE");
    expect(screen.queryByRole("button", { name: "Apply draft to form below" })).not.toBeInTheDocument();
  });
});
