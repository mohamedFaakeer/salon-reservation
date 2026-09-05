// Standalone visual verification for the admin responsiveness pass.
// Not part of the e2e suite — just screenshots + interaction checks against
// the already-running dev server (localhost:3002) and API (localhost:3000).
import { chromium, request as pwRequest } from "@playwright/test";
import { mkdirSync } from "node:fs";

const API_URL = "http://localhost:3000/api/v1";
const BASE_URL = "http://localhost:3002";
const OUT_DIR = "C:\\Users\\moham\\AppData\\Local\\Temp\\claude\\c--Users-moham-Desktop-projects-salon-reservation-cline\\81848b05-0047-475b-afc2-099f206130b1\\scratchpad\\shots";
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const apiCtx = await pwRequest.newContext();
  const res = await apiCtx.post(`${API_URL}/auth/login`, {
    data: { email: "owner@demo.salon", password: "demo1234" },
  });
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  }
  const session = await res.json();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    ["salon_admin_session", JSON.stringify(session)],
  );

  // --- Phone width: 375x812 ---
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/01-today-phone-closed.png` });

  const hasHorizScrollClosed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  console.log("Horizontal overflow on /today at 375px (drawer closed):", hasHorizScrollClosed);

  await page.locator("#app-nav-toggle").click();
  await page.waitForTimeout(400); // let the transition settle
  await page.screenshot({ path: `${OUT_DIR}/02-today-phone-open.png` });

  const expanded = await page.locator("#app-nav-toggle").getAttribute("aria-expanded");
  console.log("aria-expanded after opening:", expanded);

  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log("body.style.overflow while drawer open:", bodyOverflow);

  // Click a nav item — should navigate AND close.
  await page.locator('[data-testid="nav-schedule"]').click();
  await page.waitForURL("**/schedule");
  await page.waitForTimeout(400);
  const stillTranslatedOpen = await page.locator("#app-sidebar-nav").evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t; // matrix with translateX(0) vs a negative tx means still-open vs closed
  });
  const expandedAfterNav = await page.locator("#app-nav-toggle").getAttribute("aria-expanded");
  console.log("aria-expanded after nav-item tap (should be false):", expandedAfterNav);
  console.log("sidebar transform after nav-item tap:", stillTranslatedOpen);
  await page.screenshot({ path: `${OUT_DIR}/03-schedule-phone-after-nav-close.png` });

  // Escape-to-close check: reopen then press Escape.
  await page.locator("#app-nav-toggle").click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const expandedAfterEscape = await page.locator("#app-nav-toggle").getAttribute("aria-expanded");
  console.log("aria-expanded after Escape (should be false):", expandedAfterEscape);

  // Backdrop-click-to-close check.
  await page.locator("#app-nav-toggle").click();
  await page.waitForTimeout(400);
  await page.mouse.click(360, 700); // far right, away from the 288px-wide (w-72) panel
  await page.waitForTimeout(400);
  const expandedAfterBackdrop = await page.locator("#app-nav-toggle").getAttribute("aria-expanded");
  console.log("aria-expanded after backdrop click (should be false):", expandedAfterBackdrop);

  // --- Tablet width: 834 (portrait) ---
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/04-today-tablet.png` });

  // --- 1023 vs 1024 edge ---
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/05-today-1023.png` });
  const toggleVisibleAt1023 = await page.locator("#app-nav-toggle").isVisible();
  console.log("Hamburger visible at 1023px (should be true):", toggleVisibleAt1023);

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/06-today-1024.png` });
  const toggleVisibleAt1024 = await page.locator("#app-nav-toggle").isVisible();
  console.log("Hamburger visible at 1024px (should be false):", toggleVisibleAt1024);
  const sidebarVisibleAt1024 = await page.locator("#app-sidebar-nav").isVisible();
  console.log("Static sidebar visible at 1024px (should be true):", sidebarVisibleAt1024);

  // --- Desktop: 1440 ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/07-today-desktop.png` });

  // --- Attendance table clipping check, phone width ---
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/attendance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/08-attendance-phone.png` });
  const attendanceHorizOverflowsPage = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  console.log("Whole-page horizontal overflow on /attendance at 375px (should be false):", attendanceHorizOverflowsPage);

  // --- Skills matrix mobile accordion vs desktop grid ---
  await page.goto(`${BASE_URL}/staff`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="tab-matrix"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/09-staff-skills-phone.png`, fullPage: true });
  const mobileAccordionVisible = await page.locator('[data-testid^="mobile-matrix-row-"]').first().isVisible().catch(() => false);
  console.log("Mobile skills accordion visible at 375px:", mobileAccordionVisible);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/10-staff-skills-desktop.png`, fullPage: true });
  const desktopGridVisible = await page.locator('[data-testid^="matrix-row-"]').first().isVisible().catch(() => false);
  console.log("Desktop skills grid visible at 1440px:", desktopGridVisible);

  await browser.close();
  console.log("Screenshots saved to", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
