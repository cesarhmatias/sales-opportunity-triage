// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  render(<TriageWorkspace store={createWorkspaceStore(() => new MemoryStorage())} />);
  fireEvent.click(screen.getByRole("button", { name: /^#\d+\s*Cedar/ }));
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const extract = (note: string) => {
  fireEvent.change(screen.getByLabelText("Raw call notes"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Extract verified draft" }));
};

const cedarResult: ExtractNoteResponse = {
  prospectId: "cedar",
  attempts: 2,
  verified: [
    { field: "buyerStatus", value: "confirmed", quote: "she confirmed she's the economic buyer" },
    { field: "timelineDays", value: 21, quote: "They plan to decide within three weeks" },
  ],
  rejected: [
    {
      field: "budgetStatus",
      value: "confirmed",
      quote: "Budget isn't confirmed",
      stage: "entailment",
      reason: "The quote negates it.",
      attempt: 1,
    },
  ],
  draftPatch: { buyerStatus: "confirmed", targetDecisionDate: "2026-03-31" },
  impact: {
    company: "Cedar",
    before: { rank: 4, score: 37, stance: "queue_next" },
    after: { rank: 3, score: 62, stance: "work_today" },
    displaced: ["Fern"],
    missingInfoAfter: ["Budget not yet discussed"],
    gateReasonsAfter: [],
  },
  nextAction: {
    action: { summary: "Call Dana Ortiz Thursday about Cedar's budget approval steps", ownerId: "jordan-lee", followUpDate: "2026-03-12" },
    source: "model",
    modelDraftErrors: [],
  },
  nodeTrace: [
    { node: "extract_facts", status: "ok", summary: "Attempt 1: proposed 3 field(s).", durationMs: 5 },
    { node: "verify_entailment", status: "rejected", summary: "Attempt 1: 2 verified, 1 rejected.", durationMs: 4 },
  ],
};

describe("call-note copilot panel", () => {
  it("explains that live extraction isn't configured (503) and leaves the manual form usable", async () => {
    const fetchMock = stubFetch(503, { code: "LLM_UNAVAILABLE", message: "not configured" });
    renderOnCedar();
    extract("Spoke with their COO; budget isn't confirmed.");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-code", "LLM_UNAVAILABLE");
    expect(alert).toHaveTextContent(/isn't configured on this deployment/);
    expect(alert).toHaveTextContent(/manual form right below/);
    expect(screen.getByRole("button", { name: "Save change & next action" })).toBeEnabled();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ prospectId: "cedar", actorId: "jordan-lee" });
    expect(sent.prospects).toHaveLength(6);
  });

  it("shows verified and rejected facts with engine impact, then applies only verified values to the form", async () => {
    stubFetch(200, cedarResult);
    renderOnCedar();
    extract("Messy notes about Cedar");

    expect(await screen.findByText(/would be displaced from today's focus slots/)).toHaveTextContent(
      "Cedar #4 → #3 (37 pts → 62 pts), Work today. Fern would be displaced",
    );
    expect(screen.getByText(/The quote negates it/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply draft to the form below" }));

    await waitFor(() => expect(screen.getByLabelText("Economic buyer (decision maker)")).toHaveValue("confirmed"));
    expect(screen.getByLabelText("Decision date")).toHaveValue("2026-03-31");
    expect(screen.getByLabelText("Budget")).toHaveValue("unknown"); // rejected field stays unknown
    expect(screen.getByLabelText("Buyer name")).toHaveValue(""); // nothing invented
    expect(screen.getByLabelText("Next action summary")).toHaveValue(
      "Call Dana Ortiz Thursday about Cedar's budget approval steps",
    );
    expect(screen.getByLabelText("Follow-up date")).toHaveValue("2026-03-12");
    expect(screen.getByRole("heading", { name: /Record qualification change/ })).toHaveFocus();
    expect(screen.getByText(/Prefilled from call notes/)).toBeInTheDocument();
  });

  it("rejects a response that doesn't match the contract instead of trusting it", async () => {
    stubFetch(200, { ...cedarResult, impact: { ...cedarResult.impact, winProbability: 0.8 } });
    renderOnCedar();
    extract("Messy notes about Cedar");
    expect(await screen.findByRole("alert")).toHaveAttribute("data-code", "BAD_RESPONSE");
    expect(screen.queryByRole("button", { name: "Apply draft to the form below" })).not.toBeInTheDocument();
  });
});
