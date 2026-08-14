import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes the NestJS API + local Postgres are already running (same
 * precondition `apps/api`'s own e2e suite has) — override `PLAYWRIGHT_API_URL`
 * if the API isn't on the default port.
 */
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000/api/v1";
// Must match a CORS_ORIGINS entry in .env (apps/web's own default dev port) —
// the browser's client-side fetch to the API is a real cross-origin request.
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3001";
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build avoids Next dev's on-demand-compile latency, which
    // caused real navigation timeouts under concurrent test load.
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
