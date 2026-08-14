import { test, expect } from "@playwright/test";

/**
 * The server independently rejects a STAFF-created appointment regardless
 * (proven at the API layer in apps/api's own appointments.e2e-spec.ts —
 * "denies STAFF from creating an appointment"). This test is specifically
 * about the *frontend* hiding the action for a role that can't use it
 * (UX.md: "frontend hiding = convenience"), same framing as apps/web's
 * slot-taken test proving frontend behavior, not re-proving the API rule.
 */
test("STAFF does not see the New booking action", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-email").fill("staff@demo.salon");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("current-user")).toContainText("STAFF");
  await expect(page.getByTestId("new-booking-button")).toHaveCount(0);
});

test("RECEPTIONIST does see the New booking action", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-email").fill("receptionist@demo.salon");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("new-booking-button")).toBeVisible();
});
