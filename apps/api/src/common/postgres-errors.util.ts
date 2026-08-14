/** Postgres SQLSTATE codes surfaced by the `pg` driver as `err.code`. */
export function isExclusionViolation(err: unknown): boolean {
  return hasCode(err, "23P01");
}

export function isUniqueViolation(err: unknown): boolean {
  return hasCode(err, "23505");
}

function hasCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === code;
}
