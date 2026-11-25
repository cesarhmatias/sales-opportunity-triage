import { expect, test, type Locator, type Page } from "@playwright/test";
import { cedarExtraction } from "./fixtures/cedarExtraction";

/* ---------- helpers ---------- */

const card = (page: Page, company: string) => page.getByRole("button", { name: new RegExp(`^#\\d+\\s*${company}`) });
const focusSection = (page: Page) => page.locator('section[aria-labelledby="focus-heading"]');
const outsideSection = (page: Page) => page.locator('section[aria-labelledby="outside-heading"]');
const saveButton = (page: Page) => page.getByRole("button", { name: "Save change & next action" });

/** Text of the elements an input's aria-describedby points at (hint + inline error). */
async function describedText(field: Locator): Promise<string> {
  return field.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}


const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The copilot's expected 503 surfaces as a failed resource load; anything else is a bug.
    if (m.type() === "error" && !m.text().includes("503")) errors.push(m.text());
  });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

/* ---------- 1. initial queue ---------- */

test("initial queue: Birch, Delta, Fern hold today's slots; Alder gated at #6; Cedar #4 with unknown timeline", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Today's Focus Allocation (3 Rep Slots) (3)" })).toBeVisible();
  await expect(focusSection(page).locator("li button[aria-pressed]")).toHaveCount(3);

  const focus = focusSection(page);
  for (const [company, rank, score] of [
    ["Birch", 1, 74],
    ["Delta", 2, 73],
    ["Fern", 3, 59],
  ] as const) {
    const c = focus.getByRole("button", { name: new RegExp(`^#${rank}\\s*${company}`) });
    await expect(c).toContainText(`${score} / 100`);
    await expect(c).toContainText("Work today");
  }

  const outside = outsideSection(page);
  const cedar = outside.getByRole("button", { name: /^#4\s*Cedar/ });
  await expect(cedar).toContainText("37 / 100");
  await expect(cedar).toContainText("Queue next");
  await expect(cedar).toContainText("Timeline unknown");

  const alder = outside.getByRole("button", { name: /^#6\s*Alder/ });
  await expect(alder).toContainText("$120,000 potential ACV");
  await expect(alder).toContainText("Gated");
  await expect(alder).toContainText("Excluded today");
});

/* ---------- 2. keyboard accessibility of the comparison modal ---------- */

test("comparison modal: keyboard open, Escape closes, focus returns to the button", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Compare Birch ($24k) vs. Alder ($120k)" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.locator("dialog");
  await expect(dialog).toHaveJSProperty("open", true);
  expect(await dialog.evaluate((d) => d.matches(":modal"))).toBe(true);
  await expect(dialog.getByRole("heading", { name: "Compare Birch vs. Alder" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveJSProperty("open", false);
  await expect(trigger).toBeFocused();
});

/* ---------- 3. validation + Cedar walkthrough + reload persistence ---------- */

test("Cedar: vague action and empty date fail inline, then a qualified save moves Cedar to #3 and persists", async ({ page }) => {
  await card(page, "Cedar").click();
  await expect(card(page, "Cedar")).toHaveAttribute("aria-pressed", "true");

  // Invalid attempt: vague summary + no follow-up date.
  const summary = page.getByLabel("Next action summary");
  const followUp = page.getByLabel("Follow-up date");
  await summary.fill("Follow up with them soon");
  await page.getByLabel("Owner").selectOption("alex-rivera");
  await saveButton(page).click();

  await expect(summary).toHaveAttribute("aria-invalid", "true");
  await expect(followUp).toHaveAttribute("aria-invalid", "true");
  expect(await describedText(summary)).toContain("too vague");
  expect(await describedText(followUp)).toContain("Follow-up date must be a valid date");
  await expect(summary).toBeFocused(); // first invalid field in form order
  await expect(page.getByRole("alert").filter({ hasText: "Not saved" })).toBeVisible();

  // Qualify Cedar.
  await page.getByLabel("Economic buyer (decision maker)").selectOption("confirmed");
  await page.getByLabel("Buyer name").fill("Maya Lin");
  await page.getByLabel("Buyer title").fill("VP of Operations");
  await page.locator("#qual-cedar-targetDecisionDate").fill("2026-03-31"); // 21 days after 2026-03-10
  await summary.fill("Call Maya Lin Thursday about procurement timeline");
  await followUp.fill("2026-03-12");
  await expect(page.getByText(/If saved:/)).toContainText("62 pts");
  await saveButton(page).click();

  const banner = page.getByTestId("save-banner");
  await expect(banner).toBeFocused();
  await expect(banner).toContainText("Saved Cedar: #4 (37 pts) → #3 (62 pts), Work today.");
  await expect(banner).toContainText("Cedar now ranks ahead of Fern, which was displaced from today's 3 focus slots.");

  const assertQualifiedState = async () => {
    await expect(focusSection(page).getByRole("button", { name: /^#3\s*Cedar/ })).toContainText("62 / 100");
    const fern = outsideSection(page).getByRole("button", { name: /^#4\s*Fern/ });
    await expect(fern).toContainText("Queue next");
    await expect(fern).not.toContainText("Work today");
  };
  await assertQualifiedState();

  await page.reload();
  await assertQualifiedState();
  await card(page, "Cedar").click();
  const facts = page.locator('section[aria-labelledby="facts-heading"]');
  await expect(facts).toContainText("Confirmed");
  await expect(facts).toContainText("Maya Lin · VP of Operations");
  await expect(facts).toContainText("Mar 31, 2026");
  const log = page.locator('section[aria-labelledby="log-heading"]');
  await expect(log).toContainText("Call Maya Lin Thursday about procurement timeline");
  await expect(log).toContainText("Alex Rivera (Sales Rep)");
  await expect(log).toContainText("#4 · 37 pts · Queue next → #3 · 62 pts · Work today");
  await expect(followUp).toHaveValue("2026-03-12");
});

/* ---------- 4. LangGraph copilot UI flow (mocked API, no tokens) ---------- */

test("copilot: sample note → extract (recorded live response) → inspect trace and unknowns → apply → save", async ({ page }) => {
  let requestBody: Record<string, unknown> | null = null;
  await page.route("**/api/extract-note", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cedarExtraction) });
  });

  await card(page, "Cedar").click();
  await page.getByText("Optional: Extract draft from call note with Claude + LangGraph").click();
  await page.getByRole("button", { name: "Sample: buyer confirmed, 21-day window" }).click();
  await page.getByRole("button", { name: "Extract draft with LangGraph" }).click();

  const preview = page.getByRole("region", { name: "Draft preview" });
  await expect(preview).toBeVisible();
  expect(requestBody).toMatchObject({ prospectId: "cedar", actorId: "jordan-lee" });
  expect(String(requestBody!.rawNote)).toContain("Maya Lin, VP of Operations");

  await expect(preview.getByTestId("copilot-movement")).toHaveText("Cedar: #4, 37 pts → #3, 62 pts");
  await expect(preview.getByRole("list", { name: "Executed graph nodes" }).getByRole("listitem")).toHaveText([
    "extract_facts",
    "verify_entailment",
    "simulate_impact",
    "draft_action",
  ]);
  await expect(preview).not.toContainText("Retry:"); // the live run needed no retry
  await expect(preview).toContainText("“They want to make a buying decision within 21 days.”");
  await expect(preview.getByText("Budget status kept as unknown")).toBeVisible();
  await expect(preview.getByText("Workflow fit kept as apparent")).toBeVisible();

  await preview.getByRole("button", { name: "Apply draft to form below" }).click();
  await expect(page.getByRole("heading", { name: /Record qualification change/ })).toBeFocused();
  await expect(page.getByLabel("Economic buyer (decision maker)")).toHaveValue("confirmed");
  await expect(page.getByLabel("Buyer name")).toHaveValue("Maya Lin");
  await expect(page.locator("#qual-cedar-targetDecisionDate")).toHaveValue("2026-03-31");
  await expect(page.getByLabel("Budget")).toHaveValue("unknown");
  await expect(page.getByLabel("Next action summary")).toHaveValue(cedarExtraction.nextAction.action.summary);
  await expect(page.getByLabel("Follow-up date")).toHaveValue(cedarExtraction.nextAction.action.followUpDate);

  // Applying did not save anything: Cedar is still #4 until the rep saves.
  await expect(outsideSection(page).getByRole("button", { name: /^#4\s*Cedar/ })).toBeVisible();

  await saveButton(page).click();
  await expect(page.getByTestId("save-banner")).toContainText("Saved Cedar: #4 (37 pts) → #3 (62 pts), Work today.");
  await expect(focusSection(page).getByRole("button", { name: /^#3\s*Cedar/ })).toBeVisible();
});

/* ---------- 5. empty filter state ---------- */

test("filters: an impossible combination shows the empty state and Clear all filters recovers", async ({ page }) => {
  await page.locator("#filter-fit").selectOption("strong");
  await page.locator("#filter-timeline").selectOption("31to60");
  await expect(page.getByText("No prospects match these filters.")).toBeVisible();
  await expect(page.locator("li button[aria-pressed]")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear all filters" }).first().click();
  await expect(page.getByText("No prospects match these filters.")).toHaveCount(0);
  await expect(page.locator("li button[aria-pressed]")).toHaveCount(6);
  await expect(page.locator("#filter-fit")).toHaveValue("all");
  await expect(page.locator("#filter-timeline")).toHaveValue("all");
});

/* ---------- additional regression checks ---------- */

test("reps see overrides read-only and can switch to the manager without losing drafts", async ({ page }) => {
  await page.getByLabel("Simulated role").selectOption("sam-patel");
  await card(page, "Elm").click();
  await expect(page.getByRole("button", { name: /Pin to today/ })).toHaveCount(0);
  await page.getByLabel("Next action summary").fill("Scope the custom integration with Elm engineering");
  await page.getByRole("button", { name: "Switch to Jordan Lee (Sales Manager)" }).click();
  await expect(page.getByLabel("Override reason")).toBeFocused();
  await page.getByLabel("Override reason").fill("Strategic logo for Q2 launch");
  await page.getByRole("button", { name: /Pin to today/ }).click();
  await expect(page.getByTestId("save-banner")).toContainText("Override applied for Elm: #5 (31 pts) → #3 (31 pts)");
  await expect(page.getByLabel("Next action summary")).toHaveValue("Scope the custom integration with Elm engineering");
});

test("copilot degrades cleanly when the server has no API key (real 503)", async ({ page }) => {
  await card(page, "Cedar").click();
  await page.getByText("Optional: Extract draft from call note with Claude + LangGraph").click();
  await page.getByRole("button", { name: "Sample: buyer confirmed, 21-day window" }).click();
  await page.getByRole("button", { name: "Extract draft with LangGraph" }).click();
  await expect(page.locator('[data-code="LLM_UNAVAILABLE"]')).toContainText("isn't configured on this deployment");
  await expect(saveButton(page)).toBeEnabled();
});

test("blocked localStorage warns that changes are in memory only", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "QuotaExceededError");
    };
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Simulated role").selectOption("alex-rivera");
  await expect(page.getByText(/kept in memory only/)).toBeVisible();
  await context.close();
});

test("on a phone-sized viewport, selecting a card scrolls the inspector into view", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("/");
  await card(page, "Elm").click();
  await expect(page.locator("#inspector-heading")).toContainText("Elm");
  await expect(page.locator("#inspector-heading")).toBeInViewport();
  await page.close();
});
