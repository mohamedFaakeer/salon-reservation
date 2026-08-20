import { test, expect } from "@playwright/test";
import { signInAs } from "./auth";
import { bookableFixture } from "./fixtures";

test("receptionist books a walk-in and runs it through check-in -> in-service -> complete", async ({
  page,
  request,
}) => {
  const { staffId, serviceId } = await bookableFixture(request, "PW Admin Walkin");

  await signInAs(page, request, "receptionist@demo.salon");
  await expect(page.getByTestId("new-booking-button")).toBeVisible();

  await page.getByTestId("new-booking-button").click();

  // New customer.
  const uniqueName = `Walkin${Date.now()}`;
  await page.getByTestId("customer-search-input").fill(uniqueName);
  await page.getByRole("button", { name: "+ New customer" }).click();
  await page.getByTestId("new-customer-first-name").fill(uniqueName);
  await page.getByTestId("new-customer-last-name").fill("Tester");
  await page.getByTestId("new-customer-phone").fill(`077${Date.now().toString().slice(-7)}`);
  await page.getByTestId("create-customer-submit").click();

  // Service + staff (specific, for a deterministic slot list).
  await page.getByTestId(`drawer-service-${serviceId}`).click();
  await page.getByTestId("drawer-staff-select").selectOption(staffId);

  await expect(page.getByTestId("drawer-slot-option").first()).toBeVisible();
  await page.getByTestId("drawer-slot-option").first().click();

  await page.getByTestId("drawer-submit").click();

  // Drawer closes, booking appears on the day calendar under this staff member's column
  // (default Playwright viewport is 1280px, at/above the lg breakpoint where the calendar renders).
  // Scoped to this staff member's own column — the persistent dev DB can carry other staff's
  // "today" appointments over from earlier test runs.
  const column = page.getByTestId(`calendar-staff-column-${staffId}`);
  await expect(column).toBeVisible();
  await column.locator('[data-testid^="calendar-card-"]').first().click();

  await expect(page.getByTestId("detail-status")).toHaveText("Confirmed");
  await page.getByTestId("action-check-in").click();
  await expect(page.getByTestId("detail-status")).toHaveText("Checked in");
  await page.getByTestId("action-in-service").click();
  await expect(page.getByTestId("detail-status")).toHaveText("In service");
  await page.getByTestId("action-complete").click();
  await expect(page.getByTestId("detail-status")).toHaveText("Completed");
});
