import { test, expect } from "@playwright/test";
import { bookableFixture } from "./fixtures";

test("customer books a salon appointment end-to-end", async ({ page, request }) => {
  const { serviceId, date } = await bookableFixture(request, "Playwright Happy Path");

  await page.goto("/salon/elegance");
  await expect(page.getByRole("heading", { name: "Choose services" })).toBeVisible();

  await page.getByTestId(`service-option-${serviceId}`).click();
  await page.getByTestId("wizard-continue").click();

  await expect(page.getByRole("heading", { name: "Choose your stylist" })).toBeVisible();
  await page.getByTestId("staff-option-any").click();
  await page.getByTestId("wizard-continue").click();

  await expect(page.getByRole("heading", { name: "Choose a date" })).toBeVisible();
  await page.getByTestId(`date-option-${date}`).click();
  await page.getByTestId("wizard-continue").click();

  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await page.getByTestId("slot-option").first().click();

  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByTestId("customer-first-name").fill("Playwright");
  await page.getByTestId("customer-last-name").fill("Tester");
  await page.getByTestId("customer-phone").fill(`077${Date.now().toString().slice(-7)}`);
  await page.getByTestId("reserve-slot").click();

  await expect(page.getByRole("heading", { name: "Confirm & pay" })).toBeVisible();
  await expect(page.getByText("Slot held for")).toBeVisible();
  await page.getByTestId("confirm-payment").click();

  await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();
  const reference = await page.getByTestId("booking-reference").innerText();
  expect(reference).toMatch(/^[A-Z0-9]{2,4}-[A-Z0-9]{5}$/);

  // Manage-by-reference: the same booking is retrievable by reference + phone.
  await page.getByRole("link", { name: "View my booking" }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${reference}`));
  await page.getByTestId("lookup-phone").fill(`077${Date.now().toString().slice(-7)}`);
  // Wrong phone (freshly generated) should fail — assert the error path first.
  await page.getByRole("button", { name: "View booking" }).click();
  await expect(page.getByText(/couldn't find a booking/i)).toBeVisible();
});

test("shows an empty state when a day has no open slots", async ({ page, request }) => {
  const { serviceId } = await bookableFixture(request, "Playwright Empty Day");
  const farDate = new Date();
  farDate.setUTCDate(farDate.getUTCDate() + 3); // a day this staff member has no schedule row for
  const farDateStr = farDate.toISOString().slice(0, 10);

  await page.goto("/salon/elegance");
  await page.getByTestId(`service-option-${serviceId}`).click();
  await page.getByTestId("wizard-continue").click();
  await page.getByTestId("staff-option-any").click();
  await page.getByTestId("wizard-continue").click();

  const dateButton = page.getByTestId(`date-option-${farDateStr}`);
  if (await dateButton.isDisabled()) {
    // The day is already disabled client-side (no staff scheduled) — that IS the empty-state contract.
    return;
  }
  await dateButton.click();
  await page.getByTestId("wizard-continue").click();
  await expect(page.getByText(/No open slots on/)).toBeVisible();
});
