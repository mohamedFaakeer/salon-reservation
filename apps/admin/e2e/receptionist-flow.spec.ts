import { test, expect } from "@playwright/test";
import { bookableFixture } from "./fixtures";

test("receptionist books a walk-in and runs it through check-in -> in-service -> complete", async ({
  page,
  request,
}) => {
  const { staffId, serviceId } = await bookableFixture(request, "PW Admin Walkin");

  await page.goto("/login");
  await page.getByTestId("login-email").fill("receptionist@demo.salon");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/today$/);
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

  // Drawer closes, booking appears on Today under this staff member's group.
  const group = page.getByTestId(`staff-group-${staffId}`);
  await expect(group).toBeVisible();
  await group.locator('[data-testid^="appointment-card-"]').first().click();

  await expect(page.getByTestId("detail-status")).toHaveText("CONFIRMED");
  await page.getByTestId("action-check-in").click();
  await expect(page.getByTestId("detail-status")).toHaveText("CHECKED_IN");
  await page.getByTestId("action-in-service").click();
  await expect(page.getByTestId("detail-status")).toHaveText("IN_SERVICE");
  await page.getByTestId("action-complete").click();
  await expect(page.getByTestId("detail-status")).toHaveText("COMPLETED");
});
