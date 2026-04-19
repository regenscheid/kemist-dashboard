import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration — currently scoped to a11y smoke tests.
 *
 * Brings up Vite's dev server on port 5173 (after ensuring fixture
 * data exists at `public/data/2026-01-02/` via `pnpm fetch:local`).
 * Tests target Chromium only; extra browsers buy little for an a11y
 * audit and triple the CI time.
 *
 * Runnable locally via `pnpm e2e`. Not wired into CI by default —
 * Playwright's browser download (~300 MB) is expensive; flip this
 * on in ci.yml when the cost is worth it.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:5173/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Ensure fixture data exists before starting the dev server so
    // routes can actually render data instead of a loading spinner.
    command: "pnpm fetch:local && pnpm dev --port 5173",
    url: "http://localhost:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
