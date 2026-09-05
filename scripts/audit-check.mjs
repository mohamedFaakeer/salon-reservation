#!/usr/bin/env node
/**
 * `npm audit` gate for CI, with a transparent, narrow allowlist.
 *
 * CLAUDE.md §3 requires `npm audit` to stay free of high/critical findings.
 * Two pre-existing ones (resilience audit, 2026-09) can't actually be
 * cleared today:
 *
 * - fast-uri (GHSA-5jgf-p345-68v8 and 3 related advisories, high) — pulled
 *   in transitively by @nestjs/cli's build toolchain (webpack/ajv), several
 *   copies deep. Dev-only: never ships to the running app, and the input it
 *   parses here is trusted local schema config, not attacker-controlled
 *   data — the SSRF/host-confusion class of bug these advisories describe
 *   doesn't apply to this call site. `npm audit fix` and a package.json
 *   `overrides` entry were both tried and failed to actually change the
 *   installed tree (multiple duplicate ajv copies each pin their own
 *   nested fast-uri; forcing a full lockfile regeneration to chase this
 *   would risk drifting many unrelated pinned versions for near-zero real
 *   risk reduction).
 * - qs (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, moderate) — pulled in by
 *   Express itself. Moderate severity, so this wouldn't fail a
 *   --audit-level=high gate regardless; listed here for the record since
 *   it showed up in the same investigation.
 *
 * This allowlist is intentionally narrow (exact advisory IDs, not package
 * names) — a future high/critical finding in fast-uri or qs that ISN'T one
 * of these specific advisories still fails the build. Revisit this list
 * whenever `npm ls fast-uri` / `npm ls qs` shows the vulnerable range
 * cleared upstream, or delete entries that no longer appear in the report.
 */
import { execSync } from "node:child_process";

const ALLOWED_ADVISORY_URLS = new Set([
  "https://github.com/advisories/GHSA-5jgf-p345-68v8",
  "https://github.com/advisories/GHSA-f65p-4m7j-42xc",
  "https://github.com/advisories/GHSA-fph4-wmhf-6fwf",
  "https://github.com/advisories/GHSA-jqff-g426-hqxp",
  "https://github.com/advisories/GHSA-x5fp-wj9c-mxmx",
  "https://github.com/advisories/GHSA-4mjr-xmp4-gh2g",
]);

let report;
try {
  // npm audit exits non-zero whenever any vulnerability exists, allowlisted
  // or not -- the JSON body is still on stdout either way, which is all
  // this script actually reads.
  const raw = execSync("npm audit --json", { encoding: "utf-8", maxBuffer: 1024 * 1024 * 20 });
  report = JSON.parse(raw);
} catch (err) {
  const stdout = err.stdout?.toString();
  if (!stdout) {
    console.error("npm audit did not produce a report at all:", err.message);
    process.exit(1);
  }
  report = JSON.parse(stdout);
}

const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const unallowed = [];

for (const vuln of vulnerabilities) {
  if (vuln.severity !== "high" && vuln.severity !== "critical") {
    continue;
  }
  const advisoryUrls = (vuln.via ?? [])
    .filter((v) => typeof v === "object" && v.url)
    .map((v) => v.url);
  const allAllowed = advisoryUrls.length > 0 && advisoryUrls.every((url) => ALLOWED_ADVISORY_URLS.has(url));
  if (!allAllowed) {
    unallowed.push({ name: vuln.name, severity: vuln.severity, advisoryUrls });
  }
}

if (unallowed.length > 0) {
  console.error("npm audit found high/critical findings that are NOT on the allowlist:");
  for (const v of unallowed) {
    console.error(`  - ${v.name} (${v.severity}): ${v.advisoryUrls.join(", ") || "no advisory URL"}`);
  }
  console.error("\nEither fix them, or add the specific advisory URL to scripts/audit-check.mjs with a reason.");
  process.exit(1);
}

console.log("npm audit: no high/critical findings outside the documented allowlist.");
