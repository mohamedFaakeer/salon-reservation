import { test, expect } from "@playwright/test";
import { signInAs } from "./auth";
import { e2eName } from "./fixtures";

/**
 * FE1 — Services screen.
 *
 * Names are uniquified per run because this suite runs repeatedly against a
 * persistent dev database and services are never hard-deleted, so a fixed
 * name would collide with its own leftovers from an earlier run.
 */
test("owner creates a service, and it appears with rupee pricing", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");

  await page.getByTestId("nav-services").click();
  await expect(page).toHaveURL(/\/services$/);

  const name = e2eName("Scalp Treatment");
  await page.getByTestId("new-service-button").click();
  await page.getByTestId("service-name").fill(name);
  await page.getByTestId("service-category").fill("Hair");
  await page.getByTestId("service-duration").fill("40");
  // Typed in rupees; the drawer converts to the cents the API stores.
  await page.getByTestId("service-price").fill("3200");
  await page.getByTestId("service-save").click();

  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Rs. 3,200");
  await expect(row).toContainText("40 min");
});

test("changing a price warns that existing bookings are unaffected", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await page.getByTestId("nav-services").click();

  const name = e2eName("Hot Towel Shave");
  await page.getByTestId("new-service-button").click();
  await page.getByTestId("service-name").fill(name);
  await page.getByTestId("service-duration").fill("20");
  await page.getByTestId("service-price").fill("900");
  await page.getByTestId("service-save").click();

  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit" }).click();

  await page.getByTestId("service-price").fill("1400");
  await page.getByTestId("service-save").click();

  // The confirmation is the point: it must state that history is preserved.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Existing bookings keep the price");
  await expect(dialog).toContainText("Rs. 900");
  await expect(dialog).toContainText("Rs. 1,400");

  await page.getByTestId("confirm-accept").click();
  await expect(page.locator("tr", { hasText: name })).toContainText("Rs. 1,400");
});

test("retiring a service hides it until 'Show retired' is ticked", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await page.getByTestId("nav-services").click();

  const name = e2eName("Paraffin Wax");
  await page.getByTestId("new-service-button").click();
  await page.getByTestId("service-name").fill(name);
  await page.getByTestId("service-duration").fill("25");
  await page.getByTestId("service-price").fill("1500");
  await page.getByTestId("service-save").click();

  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Retire" }).click();

  // Gone from the default (active-only) view, but never actually deleted.
  await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  await page.getByTestId("show-inactive").check();
  await expect(page.locator("tr", { hasText: name })).toContainText("Retired");
});

test("RECEPTIONIST has no Services destination", async ({ page, request }) => {
  await signInAs(page, request, "receptionist@demo.salon");

  // MANAGE_SERVICES is OWNER/MANAGER only, so the nav item should not exist.
  await expect(page.getByTestId("nav-services")).toHaveCount(0);
});
