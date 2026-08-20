import { test, expect } from "@playwright/test";
import { signInAs } from "./auth";
import { e2eName } from "./fixtures";

/** FE3 — Availability: weekly rota, leave with collision warnings, closures. */

/** YYYY-MM-DD, n days from today — far enough out to avoid the seeded bookings. */
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

test("a stylist with no rota is called out rather than shown seven empty days", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");

  // A brand-new stylist has no schedule rows by definition.
  await page.getByTestId("nav-staff").click();
  const name = e2eName("Rota QA");
  await page.getByTestId("add-staff-button").click();
  await page.getByTestId("staff-name").fill(name);
  await page.getByTestId("staff-save").click();
  await expect(page.getByTestId("tab-matrix")).toHaveAttribute("aria-current", "page");

  await page.getByTestId("nav-availability").click();
  await expect(page).toHaveURL(/\/availability$/);

  const row = page.locator("tr", { hasText: name });
  await expect(row).toContainText("can't be booked on any day");
});

test("setting hours replaces the warning with real times", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await page.getByTestId("nav-staff").click();
  const name = e2eName("Hours QA");
  await page.getByTestId("add-staff-button").click();
  await page.getByTestId("staff-name").fill(name);
  await page.getByTestId("staff-save").click();
  await expect(page.getByTestId("tab-matrix")).toHaveAttribute("aria-current", "page");

  await page.getByTestId("nav-availability").click();
  const row = page.locator("tr", { hasText: name });
  await row.getByRole("button", { name: "Set hours" }).click();

  // Typed as clock times; stored as minutes from midnight.
  await page.getByTestId("schedule-start").fill("09:00");
  await page.getByTestId("schedule-end").fill("17:30");
  await page.getByTestId("schedule-save").click();

  await expect(page.locator("tr", { hasText: name })).toContainText("09:00–17:30");
  await expect(page.locator("tr", { hasText: name })).not.toContainText("can't be booked");
});

test("leave over an empty period reports no collisions", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await page.getByTestId("nav-availability").click();
  await page.getByTestId("tab-leave").click();
  await page.getByTestId("add-leave-button").click();

  // Far enough ahead that the demo seed's appointments cannot overlap.
  await page.getByTestId("leave-start").fill(futureDate(200));
  await page.getByTestId("leave-end").fill(futureDate(202));
  await page.getByTestId("leave-reason").fill("Annual leave");

  await expect(page.getByText("No bookings in this period.")).toBeVisible();
  await page.getByTestId("leave-save").click();

  await expect(page.locator('[data-testid^="leave-row-"]').first()).toBeVisible();
});

test("a closure can be added and removed", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await page.getByTestId("nav-availability").click();
  await page.getByTestId("tab-closures").click();

  const name = e2eName("Refurbishment");
  await page.getByTestId("add-closure-button").click();
  await page.getByTestId("closure-name").fill(name);
  await page.getByTestId("closure-start").fill(futureDate(300));
  await page.getByTestId("closure-end").fill(futureDate(303));
  await page.getByTestId("closure-save").click();

  const row = page.locator("li", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Upcoming");

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("li", { hasText: name })).toHaveCount(0);
});

test("RECEPTIONIST has no Availability destination", async ({ page, request }) => {
  await signInAs(page, request, "receptionist@demo.salon");
  await expect(page.getByTestId("nav-availability")).toHaveCount(0);
});
