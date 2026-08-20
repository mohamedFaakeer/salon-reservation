import type { APIRequestContext, Page } from "@playwright/test";
import { signInApi } from "./fixtures";

/**
 * Sign a test in without driving the login form.
 *
 * Every spec used to open /login and submit the form, so a full run performed
 * twenty-six sign-ins. Sign-in is deliberately expensive (argon2id) and
 * deliberately rate-limited per account (SECURITY.md §2), so the suite was
 * competing with a production safeguard that was doing its job — the later
 * tests were told 429 and timed out waiting for a page that never arrived.
 *
 * Authenticating over the API, once per account per run, is also closer to
 * what these tests are about: none of them except the login-form specs are
 * testing sign-in.
 *
 * The session is injected where AuthProvider reads it from on mount —
 * sessionStorage under its own key — rather than as a cookie.
 */

const STORAGE_KEY = "salon_admin_session";
const DEFAULT_PASSWORD = "demo1234";

/**
 * Seeds the session, then lands on `path`. The init script re-runs on every
 * navigation in this page, so reloads and client-side routing keep the session.
 */
export async function signInAs(
  page: Page,
  request: APIRequestContext,
  email: string,
  path = "/today",
): Promise<void> {
  const session = await signInApi(request, email);
  await page.addInitScript(
    ([key, value]) => {
      window.sessionStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
  await page.goto(path);
}

/**
 * The real login form, for the specs that are about signing in. Everything
 * else should use `signInAs`.
 */
export async function signInThroughForm(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(DEFAULT_PASSWORD);
  await page.getByTestId("login-submit").click();
}
