/**
 * Sri Lankan phone number normalization for outbound SMS (Notification
 * §"SMS/WhatsApp gateway" — DECISIONS.md §38). `CreateCustomerDto.phone`
 * accepts any free-form string (5-32 chars, no format regex) since staff
 * type it in by hand in whatever shape they're used to — "0771234567",
 * "+94 77 123 4567", "94771234567" all reach the DB as typed. A gateway
 * needs one consistent shape, so every outbound send normalizes here
 * rather than trusting the stored string.
 */

/**
 * Normalizes a Sri Lankan mobile number to bare E.164 digits with no `+`
 * (the shape Text.lk's API expects, e.g. "94771234567"), stripping spaces,
 * dashes, and parentheses first.
 *
 * Accepts local (`0771234567`), international with plus (`+94771234567`),
 * and international without plus (`94771234567`) — the three shapes a
 * Sri Lankan customer or staff member would actually type.
 *
 * Returns `null` for anything that doesn't resolve to a plausible 9-digit
 * Sri Lankan subscriber number after normalization, so a call site can
 * skip the send with a clear reason rather than handing a gateway garbage.
 */
export function normalizeSriLankanPhone(raw: string): string | null {
  const digitsOnly = raw.replace(/[^\d+]/g, "");
  const stripped = digitsOnly.startsWith("+") ? digitsOnly.slice(1) : digitsOnly;

  let subscriberNumber: string | null = null;
  if (stripped.startsWith("94") && stripped.length === 11) {
    subscriberNumber = stripped.slice(2);
  } else if (stripped.startsWith("0") && stripped.length === 10) {
    subscriberNumber = stripped.slice(1);
  } else if (stripped.length === 9) {
    subscriberNumber = stripped;
  }

  if (!subscriberNumber || !/^[1-9]\d{8}$/.test(subscriberNumber)) {
    return null;
  }
  return `94${subscriberNumber}`;
}
