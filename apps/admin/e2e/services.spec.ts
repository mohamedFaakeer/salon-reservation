import { test, expect, type Page } from "@playwright/test";

/**
 * FE1 — Services screen.
 *
 * Names are uniquified per run because this suite runs repeatedly against a
 * persistent dev database and services are never hard-deleted, so a fixed
 * name would collide with its own leftovers from an earlier run.
 */
function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString().slice(-6)}`;
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/(today|services)$/);
}

test("owner creates a service, and it appears with rupee pricing", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");

  await page.getByTestId("nav-services").click();
  await expect(page).toHaveURL(/\/services$/);

  const name = uniqueName("Scalp Treatment");
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

test("changing a price warns that existing bookings are unaffected", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");
  await page.getByTestId("nav-services").click();

  const name = uniqueName("Hot Towel Shave");
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

test("retiring a service hides it until 'Show retired' is ticked", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");
  await page.getByTestId("nav-services").click();

  const name = uniqueName("Paraffin Wax");
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

test("RECEPTIONIST has no Services destination", async ({ page }) => {
  await loginAs(page, "receptionist@demo.salon");

  // MANAGE_SERVICES is OWNER/MANAGER only, so the nav item should not exist.
  await expect(page.getByTestId("nav-services")).toHaveCount(0);
});
