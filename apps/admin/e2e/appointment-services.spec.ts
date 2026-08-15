import { test, expect } from "@playwright/test";
import { assignServices, createScheduleForToday, createService, createStaff, login } from "./fixtures";

test("receptionist adds a service to an appointment, then removes it via the detail drawer", async ({
  page,
  request,
}) => {
  const owner = await login(request, "owner@demo.salon", "demo1234");
  const unique = `PW Services ${Date.now()}`;
  const staffId = await createStaff(request, owner, `${unique} Staff`);
  const serviceAId = await createService(request, owner, `${unique} Service A`, 30, 500000);
  const serviceBId = await createService(request, owner, `${unique} Service B`, 15, 300000);
  await assignServices(request, owner, staffId, [serviceAId, serviceBId]);
  await createScheduleForToday(request, owner, staffId);

  await page.goto("/login");
  await page.getByTestId("login-email").fill("receptionist@demo.salon");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByTestId("walk-in-button").click();
  const customerName = `ServicesPanel${Date.now()}`;
  await page.getByTestId("customer-search-input").fill(customerName);
  await page.getByRole("button", { name: "+ New customer" }).click();
  await page.getByTestId("new-customer-first-name").fill(customerName);
  await page.getByTestId("new-customer-last-name").fill("Tester");
  await page.getByTestId("new-customer-phone").fill(`077${Date.now().toString().slice(-7)}`);
  await page.getByTestId("create-customer-submit").click();
  await page.getByTestId(`drawer-service-${serviceAId}`).click();
  await page.getByTestId("drawer-staff-select").selectOption(staffId);
  await expect(page.getByTestId("drawer-slot-option").first()).toBeVisible();
  await page.getByTestId("drawer-slot-option").first().click();
  await page.getByTestId("drawer-submit").click();

  const column = page.getByTestId(`calendar-staff-column-${staffId}`);
  await expect(column).toBeVisible();
  await column.locator('[data-testid^="calendar-card-"]').first().click();

  // Add a second service; the total should now reflect both.
  await page.getByTestId("show-add-service").click();
  await page.getByTestId(`add-service-option-${serviceBId}`).click();
  await page.getByTestId("submit-add-service").click();
  await expect(page.getByTestId("detail-total")).toHaveText("Rs. 8,000");

  // Remove the just-added service specifically (not Service A) — the total
  // should drop back to Service A's price alone.
  const serviceBRow = page.locator("li", { hasText: `${unique} Service B` });
  await serviceBRow.getByText("Remove").click();
  await page.getByTestId("remove-service-reason").fill("customer changed their mind");
  await page.getByTestId("confirm-remove-service").click();
  await expect(page.getByTestId("detail-total")).toHaveText("Rs. 5,000");
  await expect(page.getByText(`${unique} Service B`)).toHaveCount(0);
});
