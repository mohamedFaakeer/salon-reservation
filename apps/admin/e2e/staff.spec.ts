import { test, expect, type Page } from "@playwright/test";

/**
 * FE2 — Staff & skills.
 *
 * Names are uniquified per run: staff are deactivated rather than deleted, so
 * a fixed name would collide with leftovers from an earlier run.
 */
function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString().slice(-6)}`;
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/today$/);
}

test("a new stylist is flagged unbookable until skills are assigned", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");
  await page.getByTestId("nav-staff").click();
  await expect(page).toHaveURL(/\/staff$/);

  const name = uniqueName("Ishara");
  await page.getByTestId("add-staff-button").click();
  await page.getByTestId("staff-name").fill(name);
  await page.getByTestId("staff-save").click();

  // "Add and choose skills" promises the matrix — it should land there.
  await expect(page.getByTestId("tab-matrix")).toHaveAttribute("aria-current", "page");

  // The team tab must state the contradiction: active, but unbookable.
  await page.getByTestId("tab-team").click();
  const row = page.locator("tr", { hasText: name });
  await expect(row).toContainText("Can't be booked");
  await expect(row).toContainText("None");
  await expect(row.getByRole("button", { name: "Assign skills" })).toBeVisible();
});

test("assigning a skill clears the unbookable warning", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");
  await page.getByTestId("nav-staff").click();

  const name = uniqueName("Tharindu");
  await page.getByTestId("add-staff-button").click();
  await page.getByTestId("staff-name").fill(name);
  await page.getByTestId("staff-save").click();
  await expect(page.getByTestId("tab-matrix")).toHaveAttribute("aria-current", "page");

  // Tick the first service for this stylist's row, then save that row.
  const row = page.locator('[data-testid^="matrix-row-"]', { hasText: name });
  await row.locator('input[type="checkbox"]').first().check();
  await row.getByRole("button", { name: "Save" }).click();

  await page.getByTestId("tab-team").click();
  const teamRow = page.locator("tr", { hasText: name });
  await expect(teamRow).toContainText("1 service");
  await expect(teamRow).not.toContainText("Can't be booked");
});

test("a service no active stylist can perform is called out", async ({ page }) => {
  await loginAs(page, "owner@demo.salon");
  await page.getByTestId("nav-services").click();

  // A brand-new service has nobody qualified for it by definition.
  const serviceName = uniqueName("Threading");
  await page.getByTestId("new-service-button").click();
  await page.getByTestId("service-name").fill(serviceName);
  await page.getByTestId("service-duration").fill("20");
  await page.getByTestId("service-price").fill("700");
  await page.getByTestId("service-save").click();
  await expect(page.locator("tr", { hasText: serviceName })).toBeVisible();

  await page.getByTestId("nav-staff").click();
  await page.getByTestId("tab-matrix").click();

  // Coverage runs both ways — the matrix must surface the uncovered service.
  await expect(page.getByTestId("uncovered-warning")).toContainText(serviceName);
});

test("RECEPTIONIST has no Staff destination", async ({ page }) => {
  await loginAs(page, "receptionist@demo.salon");
  await expect(page.getByTestId("nav-staff")).toHaveCount(0);
});
