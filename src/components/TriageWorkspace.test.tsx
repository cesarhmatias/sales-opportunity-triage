// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore, type WorkspaceStore } from "../storage/triageStorage";
import { FullStorage, MemoryStorage } from "../test/fakeStorage";
import { TriageWorkspace } from "./TriageWorkspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWorkspace(storage: Storage = new MemoryStorage()): WorkspaceStore {
  const store = createWorkspaceStore(() => storage);
  render(<TriageWorkspace store={store} />);
  return store;
}

/** The queue card's main button (not the header "Compare Birch vs. Alder" button). */
const card = (company: string) => screen.getByRole("button", { name: new RegExp(`^#\\d+\\s*${company}`) });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** Fills Cedar's discovery: buyer confirmed + 21-day timeline, with a valid next action. */
function fillCedarDiscovery({ followUpDate = "2026-03-12" } = {}) {
  fireEvent.click(card("Cedar"));
  type("Economic buyer (decision maker)", "confirmed");
  type("Decision date", "2026-03-31");
  type("Next action summary", "Call Maya Lin Thursday about procurement timeline");
  type("Owner", "alex-rivera");
  type("Follow-up date", followUpDate);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save change & next action" }));

describe("manager override visibility and role switching", () => {
  it("shows reps a read-only note and keeps unsaved form drafts through role switches and an override", () => {
    renderWorkspace();
    type("Simulated role", "alex-rivera");

    // Rep view: no pin/defer controls, just a read-only note with a quick switch.
    expect(screen.queryByRole("button", { name: /Pin to today/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Defer from today/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only: only the sales manager can pin or defer/)).toBeInTheDocument();

    // Unsaved drafts in the qualification/next-action form.
    type("Next action summary", "Send SOC2 report to Birch procurement");
    type("Reason for change (optional)", "Draft reason the rep is still writing");

    fireEvent.click(screen.getByRole("button", { name: "Switch to Jordan Lee (Sales Manager)" }));
    expect(screen.getByLabelText("Simulated role")).toHaveValue("jordan-lee");
    expect(screen.getByRole("button", { name: /Pin to today/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Override reason")).toHaveFocus();
    expect(screen.getByLabelText("Next action summary")).toHaveValue("Send SOC2 report to Birch procurement");

    // Applying an override records a revision; the unsaved qualification draft must survive it.
    type("Override reason", "Champion is on leave until April");
    fireEvent.click(screen.getByRole("button", { name: /Defer from today/ }));
    expect(screen.getByTestId("save-banner")).toHaveTextContent(/Override applied for Birch/);
    expect(screen.getByLabelText("Next action summary")).toHaveValue("Send SOC2 report to Birch procurement");
    expect(screen.getByLabelText(/Reason for change/)).toHaveValue("Draft reason the rep is still writing");

    // Switching via the header select keeps drafts too.
    type("Simulated role", "sam-patel");
    expect(screen.getByLabelText("Next action summary")).toHaveValue("Send SOC2 report to Birch procurement");
    expect(screen.queryByRole("button", { name: /Clear override/ })).not.toBeInTheDocument();
  });
});

describe("validation feedback", () => {
  it("marks the missing follow-up date invalid, describes the error, and focuses it", () => {
    renderWorkspace();
    fillCedarDiscovery({ followUpDate: "" });
    save();

    const followUp = screen.getByLabelText("Follow-up date");
    expect(followUp).toHaveAttribute("aria-invalid", "true");
    const describedIds = followUp.getAttribute("aria-describedby")!.split(" ");
    const descriptions = describedIds.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(descriptions).toMatch(/Follow-up date must be a valid date/);
    expect(followUp).toHaveFocus();
    expect(screen.getByLabelText("Next action summary")).not.toHaveAttribute("aria-invalid");
  });

  it("focuses the first invalid field in form order when several fail", () => {
    renderWorkspace();
    fireEvent.click(card("Cedar"));
    type("Next action summary", "follow up with them soon");
    save();

    const summary = screen.getByLabelText("Next action summary");
    expect(summary).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Owner")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Follow-up date")).toHaveAttribute("aria-invalid", "true");
    expect(summary).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(/Not saved/);
  });
});

describe("save confirmation banner", () => {
  it("focuses the confirmation and names the prospect displaced from today's slots", () => {
    renderWorkspace();
    fillCedarDiscovery();
    save();

    const banner = screen.getByTestId("save-banner");
    expect(banner).toHaveAttribute("data-tone", "success");
    expect(banner).toHaveTextContent("Saved Cedar: #4 (37 pts) → #3 (62 pts), Work today.");
    expect(banner).toHaveTextContent("Cedar now ranks ahead of Fern, which was displaced from today's 3 focus slots.");
    expect(banner).toHaveFocus();
  });

  it("clears the confirmation when a different prospect is selected, but not when re-selecting the same one", () => {
    renderWorkspace();
    fillCedarDiscovery();
    save();
    expect(screen.getByTestId("save-banner")).toBeInTheDocument();

    fireEvent.click(card("Cedar"));
    expect(screen.getByTestId("save-banner")).toBeInTheDocument();

    fireEvent.click(card("Birch"));
    expect(screen.queryByTestId("save-banner")).not.toBeInTheDocument();
  });

  it("clears an earlier confirmation when a later save fails validation", () => {
    renderWorkspace();
    fillCedarDiscovery();
    save();
    type("Next action summary", "call them");
    save();
    expect(screen.queryByTestId("save-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Not saved/);
  });

  it("warns with an amber icon when storage fails, and keeps the memory-only warning after the banner clears", () => {
    renderWorkspace(new FullStorage());
    fillCedarDiscovery();
    save();

    const banner = screen.getByTestId("save-banner");
    expect(banner).toHaveAttribute("data-tone", "warning");
    expect(banner).toHaveTextContent(/kept in memory only/);
    expect(within(banner).getByTestId("warning-icon")).toHaveClass("text-amber-600");
    expect(banner).toHaveFocus();

    fireEvent.click(card("Birch"));
    expect(screen.queryByTestId("save-banner")).not.toBeInTheDocument();
    expect(screen.getByText(/could not be written to browser storage/)).toBeInTheDocument();
  });
});

describe("mobile layout", () => {
  function stubViewport(stacked: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("max-width") ? stacked : false, media: query })),
    );
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    return scroll;
  }

  it("scrolls the inspector into view when a card is selected below 1024px", () => {
    const scroll = stubViewport(true);
    renderWorkspace();
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(card("Elm"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not scroll on wide viewports", () => {
    const scroll = stubViewport(false);
    renderWorkspace();
    fireEvent.click(card("Elm"));
    expect(scroll).not.toHaveBeenCalled();
  });
});
