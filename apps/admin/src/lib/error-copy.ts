import { ApiRequestError } from "./api-client";

/**
 * Turns an API failure into something a receptionist can act on.
 *
 * The server already returns an actionable `message` per CLAUDE.md §5, and for
 * most codes that message is the right thing to show. This map exists for the
 * cases where the operator's *next move* is not obvious from the message alone
 * — a taken slot, an expired hold, a duplicate customer. Those get a recovery
 * line that names what to do, because "409 Conflict" is not a plan.
 *
 * Anything unmapped falls through to the server's own message. The generic
 * catch-all is deliberately last and deliberately specific about what the
 * operator should do rather than apologising.
 */

export interface ErrorCopy {
  title: string;
  detail: string;
}

const BY_CODE: Record<string, ErrorCopy> = {
  SLOT_UNAVAILABLE: {
    title: "That time was taken",
    detail: "Someone booked it while you were filling this in. Pick another time — the list has refreshed.",
  },
  HOLD_EXPIRED: {
    title: "The hold ran out",
    detail: "Slots are held for ten minutes. Choose the time again to take a fresh hold.",
  },
  DUPLICATE_CUSTOMER: {
    title: "This customer already exists",
    detail: "Search for them by phone number instead of creating a second record.",
  },
  OUTSIDE_BOOKING_WINDOW: {
    title: "That date is too far ahead",
    detail: "Change how far ahead customers can book under Settings → Booking window.",
  },
  STAFF_NOT_QUALIFIED: {
    title: "This stylist can't do that service",
    detail: "Assign the service to them on Staff & skills, or pick a different stylist.",
  },
  STAFF_UNAVAILABLE: {
    title: "That stylist isn't working then",
    detail: "Check their rota under Availability, or choose another stylist.",
  },
  VALIDATION_ERROR: {
    title: "Some details need fixing",
    detail: "The highlighted fields have the problem. Correct them and try again.",
  },
  FORBIDDEN: {
    title: "Your role can't do that",
    detail: "Ask an owner or manager to make this change.",
  },
  RATE_LIMITED: {
    title: "Too many attempts",
    detail: "Wait about a minute, then try again.",
  },
};

export function errorCopy(err: unknown): ErrorCopy {
  if (err instanceof ApiRequestError) {
    const mapped = BY_CODE[err.code];
    if (mapped) {
      return mapped;
    }
    if (err.statusCode === 403) {
      return BY_CODE.FORBIDDEN;
    }
    if (err.statusCode === 429) {
      return BY_CODE.RATE_LIMITED;
    }
    if (err.statusCode >= 500) {
      return {
        title: "The salon system isn't responding",
        detail: "Nothing was saved. Try again in a moment; if it keeps failing, the API may be restarting.",
      };
    }
    // The server writes actionable messages; trust it rather than
    // overwriting a specific one with something vaguer.
    return { title: err.message, detail: "" };
  }

  if (err instanceof TypeError) {
    // fetch() rejects with TypeError when the network is unreachable.
    return {
      title: "Can't reach the salon system",
      detail: "Check your internet connection. Nothing was saved.",
    };
  }

  return {
    title: "That didn't go through",
    detail: "Nothing was saved. Try again — if it happens twice, reload the page.",
  };
}
