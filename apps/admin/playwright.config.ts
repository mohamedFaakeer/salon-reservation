import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes the NestJS API + local Postgres are already running (same
 * precondition apps/api's own e2e suite and apps/web's Playwright suite
 * have) — override `PLAYWRIGHT_API_URL` if the API isn't on the default port.
 */
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000/api/v1";
// Must match a CORS_ORIGINS entry in .env (apps/admin's own default dev port).
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3002";
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  // Removes the rows earlier runs left behind; see e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  /**
   * Playwright's defaults (5s per assertion, 30s per test) are far too tight
   * for this stack on a developer laptop, and the reason is measured rather
   * than assumed.
   *
   * A full run pins all four cores at 92-100% — Chromium, the Next server, the
   * Nest API and Postgres all competing — and under that load the API process
   * simply stops being scheduled for seconds at a time. `/health`, which
   * touches no database and does no work, was observed stalling 10-20s at the
   * same instants as a database-backed route, and by the same number of
   * milliseconds. That is starvation, not slow code, and no assertion budget
   * makes it a behaviour failure.
   *
   * So the per-assertion budget covers the worst stall measured (20.7s) with
   * margin, while the per-test timeout stays tight enough to catch a genuinely
   * hung test. These specs assert behaviour, not latency.
   */
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build avoids Next dev's on-demand-compile latency (see
    // apps/web/playwright.config.ts — the same fix applies here).
    command: `npx next build && npx next start -p ${webPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_URL: apiUrl,
      API_SERVER_URL: apiUrl,
    },
  },
});

export { apiUrl };
