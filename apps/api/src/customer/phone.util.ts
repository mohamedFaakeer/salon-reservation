/** Digits only, with an optional leading "+" preserved (DATABASE.md §2.3 "normalized"). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}
