#!/usr/bin/env node
/**
 * Persistent Playwright driver for the UAT session.
 *
 * The admin app's access token lives in sessionStorage (never in a cookie),
 * and the app never attempts a silent refresh on mount — it only restores a
 * session from sessionStorage. That means storageState()/reload tricks can't
 * keep a login alive across separate process launches, and re-logging in for
 * every single test (there are 250+) would be slow and wouldn't match how a
 * real shift actually works. So this stays running for the whole UAT session:
 * one Chromium instance, one persistent BrowserContext+Page per named role
 * ("owner", "manager", "receptionist", "staff", "anon", ...), addressed by
 * `session` in each request. Login once per role, reuse the page for every
 * subsequent test under that role.
 *
 * POST /run   { session: "owner", steps: [...] }  -> same step vocabulary as run.mjs
 * POST /new   { session: "owner" }                -> (re)create a fresh context for that session name
 * GET  /list                                       -> active session names
 * POST /shutdown                                    -> close everything and exit
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.UAT_PORT ?? 4790);

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

const browser = await chromium.launch({ headless: true });
/** @type {Map<string, { context: import('playwright').BrowserContext, page: import('playwright').Page }>} */
const sessions = new Map();

async function getOrCreateSession(name) {
  let s = sessions.get(name);
  if (!s) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    s = { context, page };
    sessions.set(name, s);
  }
  return s;
}

async function runSteps(page, steps) {
  const results = [];
  const captured = {};
  for (const step of steps ?? []) {
    const entry = { action: step.action, ok: true };
    try {
      switch (step.action) {
        case "goto":
          await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: step.timeoutMs ?? 30000 });
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
        case "scrollIntoView":
          await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout: step.timeoutMs ?? 10000 });
          break;
        case "setInputFiles":
          // File inputs are commonly styled-hidden behind a real button, so
          // this deliberately doesn't require visibility the way fill/click do.
          await page.locator(step.selector).setInputFiles(abs(step.filePath), { timeout: step.timeoutMs ?? 10000 });
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
          await page.waitForURL(step.pattern, { timeout: step.timeoutMs ?? 15000 });
          break;
        case "waitForResponse": {
          const resp = await page.waitForResponse((r) => r.url().includes(step.urlIncludes), { timeout: step.timeoutMs ?? 60000 });
          entry.value = await responseSummary(resp);
          if (step.as) captured[step.as] = entry.value;
          break;
        }
        case "clickAndWaitForResponse": {
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
          const val = await page.evaluate(new Function(`return (${step.fn})(...arguments)`));
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
      results.push(entry);
      if (!step.optional) break;
      else continue;
    }
    results.push(entry);
  }
  return { results, captured };
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyText = Buffer.concat(chunks).toString("utf-8");
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body" }));
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions: [...sessions.keys()] }));
      return;
    }
    if (req.method === "POST" && req.url === "/new") {
      const name = body.session ?? "default";
      const old = sessions.get(name);
      if (old) {
        await old.context.close();
        sessions.delete(name);
      }
      await getOrCreateSession(name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ session: name, status: "created" }));
      return;
    }
    if (req.method === "POST" && req.url === "/run") {
      const name = body.session ?? "default";
      const { page } = await getOrCreateSession(name);
      const out = await runSteps(page, body.steps);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ session: name, ...out }));
      return;
    }
    if (req.method === "POST" && req.url === "/shutdown") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "shutting down" }));
      setTimeout(async () => {
        await browser.close();
        process.exit(0);
      }, 100);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.stack ?? err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`UAT playwright server listening on http://127.0.0.1:${PORT}`);
});

process.on("SIGTERM", async () => {
  await browser.close();
  process.exit(0);
});
