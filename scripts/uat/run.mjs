#!/usr/bin/env node
/**
 * Tiny action-runner for driving the production admin app during the UAT
 * session. Takes a JSON action script (a file path as argv[2], or JSON on
 * stdin), runs each step against a real Chromium browser via Playwright, and
 * prints a JSON result summary — never assertions, never a pass/fail verdict:
 * Claude reads the summary + screenshot and reports back to the user, who
 * decides pass/fail.
 *
 * Action script shape:
 * {
 *   "testId": "AUTH-02",
 *   "loadStorageState": "scripts/uat/state/owner.json",   // optional, reuse a saved session
 *   "saveStorageState": "scripts/uat/state/owner.json",   // optional, persist session after
 *   "steps": [
 *     { "action": "goto", "url": "https://.../login" },
 *     { "action": "fill", "selector": "[data-testid=login-email]", "value": "..." },
 *     { "action": "click", "selector": "[data-testid=login-submit]" },
 *     { "action": "waitForSelector", "selector": "...", "timeoutMs": 5000, "optional": true },
 *     { "action": "waitForTimeout", "ms": 500 },
 *     { "action": "getText", "selector": "[role=alert]", "as": "errorText", "optional": true },
 *     { "action": "getUrl", "as": "finalUrl" },
 *     { "action": "screenshot", "path": "docs/uat_screenshots/AUTH-02.png", "fullPage": true }
 *   ]
 * }
 *
 * Every step's own "optional": true means a failure (e.g. selector not
 * found) is recorded but doesn't abort the run — useful for "check whether
 * an error appears" where the error might legitimately not be there.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function abs(p) {
  return resolve(ROOT, p);
}

async function responseSummary(resp) {
  let body;
  try {
    body = await resp.json();
  } catch {
    try {
      body = await resp.text();
    } catch {
      body = null;
    }
  }
  return { status: resp.status(), url: resp.url(), body };
}

async function readInput() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(readFileSync(arg, "utf-8"));
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function main() {
  const script = await readInput();
  const results = [];
  const captured = {};

  const browser = await chromium.launch({ headless: true });
  const contextOpts = { viewport: { width: 1440, height: 900 } };
  if (script.loadStorageState) {
    contextOpts.storageState = abs(script.loadStorageState);
  }
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  for (const step of script.steps ?? []) {
    const entry = { action: step.action, ok: true };
    try {
      switch (step.action) {
        case "goto":
          await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: step.timeoutMs ?? 20000 });
          break;
        case "fill":
          await page.fill(step.selector, step.value, { timeout: step.timeoutMs ?? 10000 });
          break;
        case "click":
          await page.click(step.selector, { timeout: step.timeoutMs ?? 10000 });
          break;
        case "check":
          await page.check(step.selector, { timeout: step.timeoutMs ?? 10000 });
          break;
        case "selectOption":
          await page.selectOption(step.selector, step.value, { timeout: step.timeoutMs ?? 10000 });
          break;
        case "waitForSelector":
          await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 10000, state: step.state ?? "visible" });
          break;
        case "waitForTimeout":
          await page.waitForTimeout(step.ms ?? 500);
          break;
        case "waitForURL":
          await page.waitForURL(step.pattern, { timeout: step.timeoutMs ?? 10000 });
          break;
        case "waitForResponse": {
          const resp = await page.waitForResponse(
            (r) => r.url().includes(step.urlIncludes),
            { timeout: step.timeoutMs ?? 60000 },
          );
          entry.value = await responseSummary(resp);
          if (step.as) captured[step.as] = entry.value;
          break;
        }
        case "clickAndWaitForResponse": {
          // Starts listening before the click fires, so a response that
          // completes very quickly can never race ahead of the listener —
          // the two-step click/waitForResponse pair above can miss it.
          const [resp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes(step.urlIncludes), { timeout: step.timeoutMs ?? 60000 }),
            page.click(step.selector),
          ]);
          entry.value = await responseSummary(resp);
          if (step.as) captured[step.as] = entry.value;
          break;
        }
        case "getText": {
          const text = await page.locator(step.selector).first().textContent({ timeout: step.timeoutMs ?? 5000 });
          entry.value = text;
          if (step.as) captured[step.as] = text;
          break;
        }
        case "getAllText": {
          const texts = await page.locator(step.selector).allTextContents();
          entry.value = texts;
          if (step.as) captured[step.as] = texts;
          break;
        }
        case "count": {
          const n = await page.locator(step.selector).count();
          entry.value = n;
          if (step.as) captured[step.as] = n;
          break;
        }
        case "isVisible": {
          const vis = await page.locator(step.selector).first().isVisible();
          entry.value = vis;
          if (step.as) captured[step.as] = vis;
          break;
        }
        case "getUrl": {
          const url = page.url();
          entry.value = url;
          if (step.as) captured[step.as] = url;
          break;
        }
        case "screenshot": {
          const path = abs(step.path);
          mkdirSync(dirname(path), { recursive: true });
          await page.screenshot({ path, fullPage: step.fullPage ?? false });
          entry.value = step.path;
          break;
        }
        case "evaluate": {
          const val = await page.evaluate(step.fn);
          entry.value = val;
          if (step.as) captured[step.as] = val;
          break;
        }
        default:
          entry.ok = false;
          entry.error = `unknown action: ${step.action}`;
      }
    } catch (err) {
      entry.ok = false;
      entry.error = String(err.message ?? err);
      if (!step.optional) {
        results.push(entry);
        break;
      }
    }
    results.push(entry);
  }

  if (script.saveStorageState) {
    const path = abs(script.saveStorageState);
    mkdirSync(dirname(path), { recursive: true });
    await context.storageState({ path });
  }

  await browser.close();

  console.log(JSON.stringify({ testId: script.testId, results, captured, consoleErrors }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err.stack ?? err) }));
  process.exit(1);
});
