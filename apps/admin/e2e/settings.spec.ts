import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./auth";

/**
 * FE4 — Settings.
 *
 * This screen mutates tenant-wide rules that every other suite books against,
 * so each test puts back what it changed. The one exception is the deposit
 * rule, which is set and then restored to NO_ADVANCE within the same test —
 * leaving a deposit switched on would make every later booking spec ask for
 * payment.
 */

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId("nav-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("settings-savebar")).toBeVisible();
}

test("the save bar stays quiet until something actually changes", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  await expect(page.getByTestId("settings-dirty-state")).toHaveText("No changes to save.");
  await expect(page.getByTestId("settings-save")).toBeDisabled();

  const before = await page.getByTestId("booking-window-days").inputValue();
  await page.getByTestId("booking-window-days").fill("45");
  await expect(page.getByTestId("settings-dirty-state")).toHaveText("You have unsaved changes.");
  await expect(page.getByTestId("settings-save")).toBeEnabled();

  // Discard restores the server's value rather than merely clearing the flag.
  await page.getByTestId("settings-discard").click();
  await expect(page.getByTestId("booking-window-days")).toHaveValue(before);
  await expect(page.getByTestId("settings-save")).toBeDisabled();
});

test("an out-of-range value blocks saving and says why", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  // The DTO caps the booking window at 365 days.
  await page.getByTestId("booking-window-days").fill("400");
  await expect(page.getByTestId("settings-dirty-state")).toHaveText(
    "Fix the highlighted fields before saving.",
  );
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await expect(page.getByText("Enter a whole number from 1 to 365.")).toBeVisible();

  await page.getByTestId("settings-discard").click();
});

test("a changed refund percentage survives a reload", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  const original = await page.getByTestId("refund-after").inputValue();
  const next = original === "25" ? "30" : "25";

  await page.getByTestId("refund-after").fill(next);
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("refund-after")).toHaveValue(next);

  // Put the salon back the way this suite found it.
  await page.getByTestId("refund-after").fill(original);
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("switching the deposit rule reveals only that rule's value field", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  await page.getByTestId("advance-PERCENTAGE").check();
  await expect(page.getByTestId("advance-percent")).toBeVisible();
  await expect(page.getByTestId("advance-value-rupees")).toHaveCount(0);

  await page.getByTestId("advance-FIXED_AMOUNT").check();
  await expect(page.getByTestId("advance-value-rupees")).toBeVisible();
  await expect(page.getByTestId("advance-percent")).toHaveCount(0);

  // Nothing was saved; Discard puts the stored rule back whatever it was.
  await page.getByTestId("settings-discard").click();
  await expect(page.getByTestId("settings-dirty-state")).toHaveText("No changes to save.");
});

test("reminders are capped at five and read as sentences", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  const list = page.getByTestId("reminder-list");
  await expect(list).toContainText("1 day before");

  // Duplicates are refused rather than silently added twice.
  await page.getByTestId("reminder-input").fill("24");
  await expect(page.getByTestId("add-reminder")).toBeDisabled();
  await expect(page.getByText("There's already a reminder at that time.")).toBeVisible();

  await page.getByTestId("reminder-input").fill("0");
  await expect(page.getByTestId("add-reminder")).toBeDisabled();

  await page.getByTestId("reminder-input").fill("72");
  await page.getByTestId("add-reminder").click();
  await expect(list).toContainText("3 days before");

  await page.getByTestId("settings-discard").click();
});

test("renaming the salon updates the name in the sidebar", async ({ page, request }) => {
  await signInAs(page, request, "owner@demo.salon");
  await openSettings(page);

  const original = await page.getByTestId("salon-name").inputValue();
  const renamed = `${original} QA`;

  await page.getByTestId("salon-name").fill(renamed);
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page.locator("aside")).toContainText(renamed);

  await page.getByTestId("salon-name").fill(original);
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("RECEPTIONIST has no Settings destination", async ({ page, request }) => {
  await signInAs(page, request, "receptionist@demo.salon");
  await expect(page.getByTestId("nav-settings")).toHaveCount(0);
});
