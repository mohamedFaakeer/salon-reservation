import { test, expect } from "@playwright/test";
import { signInThroughForm } from "./auth";

/**
 * The server independently rejects a STAFF-created appointment regardless
 * (proven at the API layer in apps/api's own appointments.e2e-spec.ts —
 * "denies STAFF from creating an appointment"). This test is specifically
 * about the *frontend* hiding the action for a role that can't use it
 * (UX.md: "frontend hiding = convenience"), same framing as apps/web's
 * slot-taken test proving frontend behavior, not re-proving the API rule.
 *
 * These two are the suite's login-form coverage, so they drive the real form
 * rather than seeding a session like every other spec — two sign-ins for two
 * different accounts, which is well inside the per-account limit.
 */
test("STAFF does not see the New booking action", async ({ page }) => {
  await signInThroughForm(page, "staff@demo.salon");

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("current-user")).toContainText("STAFF");
  await expect(page.getByTestId("new-booking-button")).toHaveCount(0);
});

test("RECEPTIONIST does see the New booking action", async ({ page }) => {
  await signInThroughForm(page, "receptionist@demo.salon");

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("new-booking-button")).toBeVisible();
});
