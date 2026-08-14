import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { apiUrl, bookableFixture, login } from "./fixtures";

/**
 * The DB-level exclusion-constraint guarantee is already proven under real
 * concurrency in apps/api's own booking-concurrency.e2e-spec.ts. What this
 * test proves instead is the frontend's handling of the resulting 409: does
 * it show UX.md's exact "slot just taken" banner and refresh the grid.
 *
 * A real two-browser race would work too, but is inherently timing-flaky in
 * browser automation — booking the slot deterministically via the API right
 * before the UI's own reserve click gives the same 409 path without flake.
 */
test("slot just taken: the UI shows the banner and refreshes the grid", async ({ page, request }) => {
  const { serviceId, staffId, date } = await bookableFixture(request, "Playwright Slot Taken");

  await page.goto("/salon/elegance");
  await page.getByTestId(`service-option-${serviceId}`).click();
  await page.getByTestId("wizard-continue").click();
  await page.getByTestId("staff-option-any").click();
  await page.getByTestId("wizard-continue").click();
  await page.getByTestId(`date-option-${date}`).click();
  await page.getByTestId("wizard-continue").click();

  await expect(page.getByTestId("slot-option").first()).toBeVisible();
  const slotButton = page.getByTestId("slot-option").first();
  const slotTimeText = await slotButton.locator("span").first().innerText();
  await slotButton.click();

  await page.getByTestId("customer-first-name").fill("Racer");
  await page.getByTestId("customer-last-name").fill("One");
  await page.getByTestId("customer-phone").fill(`077${Date.now().toString().slice(-7)}`);

  // Take the exact same slot out from under the UI via the real API — this
  // is the frontend's "someone else just booked it" scenario.
  const ownerToken = await login(request, "owner@demo.salon", "demo1234");
  const availRes = await request.post(`${apiUrl}/salons/elegance/availability`, {
    data: { serviceIds: [serviceId], staffId, date },
  });
  const { slots } = await availRes.json();
  const stolenSlot = slots[0];
  const idempotencyKey = crypto.randomUUID();
  await request.post(`${apiUrl}/appointments`, {
    headers: { Authorization: `Bearer ${ownerToken}`, "Idempotency-Key": idempotencyKey },
    data: {
      newCustomer: { firstName: "Other", lastName: "Customer", phone: `077${Date.now().toString().slice(-7)}1` },
      serviceIds: [serviceId],
      staffId,
      start: stolenSlot.start,
      source: "WALK_IN",
    },
  });

  await page.getByTestId("reserve-slot").click();

  await expect(page.getByText("That slot was just booked by another customer. Pick another time.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();

  // The grid re-fetched — the stolen slot's time must not be offered as the first option anymore.
  const refreshedFirstSlot = page.getByTestId("slot-option").first();
  await expect(refreshedFirstSlot).toBeVisible();
  const refreshedTimeText = await refreshedFirstSlot.locator("span").first().innerText();
  expect(refreshedTimeText).not.toBe(slotTimeText);
});
