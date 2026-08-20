import { test, expect } from "@playwright/test";
import { signInAs } from "./auth";
import { bookableFixture } from "./fixtures";

test("walk-in quick action pre-checks immediate check-in, and the dashboard reflects it end-to-end", async ({
  page,
  request,
}) => {
  const { staffId, serviceId } = await bookableFixture(request, "PW Dashboard");

  await signInAs(page, request, "receptionist@demo.salon");

  // Stat cards render before any interaction.
  await expect(page.getByTestId("stat-card-checked-in")).toBeVisible();
  const checkedInBefore = await page.getByTestId("stat-card-checked-in").locator("p").nth(1).textContent();

  await page.getByTestId("walk-in-button").click();
  // The Walk-in quick action pre-checks "check in immediately" — New booking never does.
  await expect(page.getByTestId("drawer-check-in-now")).toBeChecked();

  const uniqueName = `Walkin${Date.now()}`;
  await page.getByTestId("customer-search-input").fill(uniqueName);
  await page.getByRole("button", { name: "+ New customer" }).click();
  await page.getByTestId("new-customer-first-name").fill(uniqueName);
  await page.getByTestId("new-customer-last-name").fill("Tester");
  await page.getByTestId("new-customer-phone").fill(`077${Date.now().toString().slice(-7)}`);
  await page.getByTestId("create-customer-submit").click();

  await page.getByTestId(`drawer-service-${serviceId}`).click();
  await page.getByTestId("drawer-staff-select").selectOption(staffId);
  await expect(page.getByTestId("drawer-slot-option").first()).toBeVisible();
  await page.getByTestId("drawer-slot-option").first().click();
  await page.getByTestId("drawer-submit").click();

  // Calendar shows the new card under this (freshly created, so uncontaminated by other test
  // runs' "today" data) staff member's own column, already CHECKED_IN.
  const column = page.getByTestId(`calendar-staff-column-${staffId}`);
  await expect(column).toBeVisible();
  const card = column.locator('[data-testid^="calendar-card-"]').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Checked in");

  // The "Check-ins" stat card increments to reflect the new CHECKED_IN appointment.
  const checkedInAfter = page.getByTestId("stat-card-checked-in").locator("p").nth(1);
  await expect(checkedInAfter).not.toHaveText(checkedInBefore ?? "");

  // Clicking the calendar card opens the same detail drawer used elsewhere.
  await card.click();
  await expect(page.getByTestId("detail-status")).toHaveText("Checked in");
});
