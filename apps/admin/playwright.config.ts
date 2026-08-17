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
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  /**
   * Playwright's defaults (5s per assertion, 30s per test) are too tight for
   * this stack on a loaded dev machine: the API runs under `nest start
   * --watch` and every sign-in performs a deliberately expensive argon2id
   * verification, so login alone can take several seconds. A multi-step spec
   * that signs in and then books through several screens needs a budget that
   * is not mostly spent on the first request. These specs assert behaviour,
   * not latency — a slow-but-correct response should pass.
   */
  timeout: 90_000,
  expect: { timeout: 15_000 },
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
