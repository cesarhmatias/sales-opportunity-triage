import { expect, test, type Page } from "@playwright/test";

const card = (page: Page, company: string) => page.getByRole("button", { name: new RegExp(`^#\\d+\\s*${company}`) });
const focusCards = (page: Page) => page.locator('section[aria-labelledby="focus-heading"] li button[aria-pressed]');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The copilot's expected 503 shows up as a failed resource load; anything else is a bug.
    if (m.type() === "error" && !m.text().includes("503")) errors.push(m.text());
  });
  (page as Page & { __errors?: string[] }).__errors = errors;
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test("seeded queue: Birch, Delta, Fern hold today's three slots", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Today's Focus Allocation \(3 Rep Slots\)/ })).toBeVisible();
  await expect(focusCards(page)).toHaveCount(3);
  await expect(focusCards(page).nth(0)).toContainText("Birch");
  await expect(focusCards(page).nth(1)).toContainText("Delta");
  await expect(focusCards(page).nth(2)).toContainText("Fern");
  await expect(card(page, "Alder")).toContainText("Gated");
});

test("Cedar walkthrough: incomplete action is blocked, then a saved change persists across reload", async ({ page }) => {
  await card(page, "Cedar").click();
  await expect(card(page, "Cedar")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "Cedar")).toContainText("37");

  await page.getByLabel("Economic buyer (decision maker)").selectOption("confirmed");
  await page.getByLabel("Buyer name").fill("Maya Lin");
  await page.getByLabel("Buyer title").fill("VP of Operations");
  await page.locator("#qual-cedar-targetDecisionDate").fill("2026-03-31");
  await page.getByLabel("Next action summary").fill("Call Maya Lin Thursday about procurement timeline");
  await page.getByLabel("Owner").selectOption("alex-rivera");

  // Follow-up date left blank: the save is refused and focus lands on the invalid field.
  await page.getByRole("button", { name: "Save change & next action" }).click();
  const followUp = page.getByLabel("Follow-up date");
  await expect(followUp).toHaveAttribute("aria-invalid", "true");
  await expect(followUp).toBeFocused();

  await followUp.fill("2026-03-12");
  await page.getByRole("button", { name: "Save change & next action" }).click();
  const banner = page.getByTestId("save-banner");
  await expect(banner).toContainText("Saved Cedar: now #3, 62 pts, Work today.");
  await expect(banner).toContainText("Fern was displaced from today's 3 focus slots.");
  await expect(banner).toBeFocused();

  await page.reload();
  await expect(focusCards(page).nth(2)).toContainText("Cedar");
  await expect(focusCards(page)).not.toContainText(["Fern"]);
  await card(page, "Cedar").click();
  const log = page.locator('section[aria-labelledby="log-heading"]');
  await expect(log).toContainText("Call Maya Lin Thursday about procurement timeline");
  await expect(log).toContainText("#4 · 37 pts · Queue next → #3 · 62 pts · Work today");
});

test("filters show an empty state that can be cleared", async ({ page }) => {
  await page.locator("#filter-fit").selectOption("strong");
  await page.locator("#filter-timeline").selectOption("31to60");
  await expect(page.getByText("No prospects match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear all filters" }).first().click();
  await expect(page.locator("li button[aria-pressed]")).toHaveCount(6);
});

test("compare dialog is modal, closes on Escape and returns focus to its trigger", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Compare Birch ($24k) vs. Alder ($120k)" });
  await trigger.click();
  await expect(page.locator("dialog")).toHaveJSProperty("open", true);
  expect(await page.evaluate(() => document.querySelector("dialog")?.matches(":modal"))).toBe(true);
  await expect(page.locator("dialog")).toContainText("fails the eligibility gate");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveJSProperty("open", false);
  await expect(trigger).toBeFocused();
});

test("reps see overrides read-only and can switch to the manager without losing drafts", async ({ page }) => {
  await page.getByLabel("Simulated role").selectOption("sam-patel");
  await card(page, "Elm").click();
  await expect(page.getByRole("button", { name: /Pin to today/ })).toHaveCount(0);
  await page.getByLabel("Next action summary").fill("Scope the custom integration with Elm engineering");
  await page.getByRole("button", { name: "Switch to Jordan Lee (Sales Manager)" }).click();
  await expect(page.getByLabel("Override reason")).toBeFocused();
  await page.getByLabel("Override reason").fill("Strategic logo for Q2 launch");
  await page.getByRole("button", { name: /Pin to today/ }).click();
  await expect(page.getByTestId("save-banner")).toContainText("Override applied for Elm: now #3");
  await expect(page.getByLabel("Next action summary")).toHaveValue("Scope the custom integration with Elm engineering");
});

test("call-note copilot degrades cleanly when no API key is configured", async ({ page }) => {
  await card(page, "Cedar").click();
  await page.getByText("Optional: Extract draft from call note with Claude + LangGraph").click();
  await page.getByRole("button", { name: "Sample: buyer confirmed, 21-day window" }).click();
  await page.getByRole("button", { name: "Extract draft with LangGraph" }).click();
  const alert = page.locator('[data-code="LLM_UNAVAILABLE"]');
  await expect(alert).toContainText("isn't configured on this deployment");
  await expect(page.getByRole("button", { name: "Save change & next action" })).toBeEnabled();
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
