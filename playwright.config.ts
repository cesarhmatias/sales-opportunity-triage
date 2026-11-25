import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end checks against a production build. The API key is blanked so the call-note
 * copilot deterministically exercises its 503 "not configured" path (no live model calls).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { ANTHROPIC_API_KEY: "" },
  },
});
