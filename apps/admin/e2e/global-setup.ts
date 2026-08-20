/* eslint-disable no-console -- a setup script that silently deletes rows is
   worse than one that says what it removed; this output is the only record. */
import { Client } from "pg";
import { E2E_MARKER } from "./fixtures";

/**
 * Remove the rows previous runs created, before this one starts.
 *
 * The suite creates a stylist or a service in almost every test — it has to,
 * since "a stylist with no rota" and "a service nobody can perform" are states
 * you can only reach by making one. Nothing removed them afterwards, because
 * the product deliberately has no delete endpoints (CLAUDE.md §1.8: no hard
 * deletes on business records), so a developer's database grew by a handful of
 * rows every run, forever.
 *
 * That is not merely untidy. The skills matrix draws a checkbox per stylist per
 * service, so 81 stylists and 93 services — the state this was found in — is
 * 7,533 inputs rendered on every load, and every run made the next one slower.
 * A suite that "degrades over time" was measuring its own litter.
 *
 * This is test infrastructure removing its own fixtures, so it is narrow by
 * construction: only names matching the fixture pattern, and only against a
 * local database. Deletes cascade to schedules, leave, assignments and
 * appointments exactly as the schema defines.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

/**
 * Two shapes, because two things are true at once.
 *
 * `E2E` and `PW` are markers no real salon record starts with, so anything
 * carrying one is ours whatever follows. The rest are ordinary Sinhala names
 * and service names that the fixtures reused, and those overlap the demo seed
 * exactly — so they only count as fixtures when followed by a run-unique
 * number. That distinction is what removes "Ishara 033303" while leaving
 * "Ishara", who is a seeded stylist an account is attached to.
 *
 * Everything the suite creates now carries E2E_MARKER; the rest are the labels
 * earlier runs used, kept so existing databases get cleaned out too.
 */
const MARKER_PREFIXES = [E2E_MARKER, "PW"];

const NUMBERED_LABELS = [
  "Rota QA",
  "Hours QA",
  "Skills QA",
  "Ishara QA",
  "Ishara",
  "Tharindu",
  "Hot Towel Shave",
  "Paraffin Wax",
  "Scalp Treatment",
  "Threading",
  "Refurbishment",
  "ServicesPanel",
];

const FIXTURE_PATTERN =
  `^((${MARKER_PREFIXES.join("|")}) |(${NUMBERED_LABELS.join("|")}) [0-9])`;

/**
 * Walk-in specs type a customer name straight into the booking form, so those
 * rows carry no space before their run number. The surname is the second half
 * of the predicate, so nothing is deleted on a name prefix alone.
 */
const FIXTURE_SURNAME = "Tester";
const FIXTURE_PATTERN_NO_SPACE = `^(${MARKER_PREFIXES.join("|")}|Walkin|ServicesPanel)[0-9]`;

function connectionString(): string {
  return (
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://salon:salon@localhost:5432/salon"
  );
}

/** A wrong URL here would delete real salon records, so this is a hard gate. */
function isLocal(url: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  const url = connectionString();
  if (!isLocal(url)) {
    console.warn(`[e2e] Skipping fixture cleanup: ${url} is not a local database.`);
    return;
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    // The suite still runs without cleanup; it is just slower.
    console.warn(`[e2e] Skipping fixture cleanup: could not connect (${String(err)}).`);
    return;
  }

  try {
    const counts: string[] = [];
    for (const table of ["staff", "service", "closure"]) {
      const res = await client.query(`delete from "${table}" where name ~ $1`, [
        FIXTURE_PATTERN,
      ]);
      counts.push(`${res.rowCount ?? 0} ${table}`);
    }

    // Customers are named by the walk-in specs rather than by e2eName, since
    // the name is typed into the booking form. Both halves must match: the
    // surname alone would be a careless thing to delete on.
    const customers = await client.query(
      `delete from customer where "lastName" = $1 and "firstName" ~ $2`,
      [FIXTURE_SURNAME, FIXTURE_PATTERN_NO_SPACE],
    );
    counts.push(`${customers.rowCount ?? 0} customer`);

    console.log(`[e2e] Cleared fixtures from earlier runs: ${counts.join(", ")}.`);
  } finally {
    await client.end();
  }
}
