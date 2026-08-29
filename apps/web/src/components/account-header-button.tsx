"use client";

import { useCustomerAuth } from "../context/customer-auth-context";

/**
 * A deliberate, on-demand entry point into the account flow — everything
 * else about sign-up/login already exists and works (`AccountOverlay`), it
 * only ever appeared passively (a 40s dwell timer, or at booking-confirm).
 * This is the same flow, just reachable the moment someone wants it rather
 * than waiting for it to interrupt them.
 */
export function AccountHeaderButton() {
  const auth = useCustomerAuth();

  if (auth.loading) {
    return null;
  }

  if (auth.account) {
    return (
      <button
        type="button"
        onClick={() => void auth.logout()}
        className="min-h-11 rounded-full border-[1.4px] border-[rgba(2,43,39,0.35)] px-4 py-2 text-[11px] font-semibold text-[#022B27] transition-colors duration-[var(--t-tap)] hover:bg-[rgba(2,43,39,0.1)]"
      >
        {auth.account.firstName} · Log out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => auth.goTo("login")}
      className="min-h-11 rounded-full border-[1.4px] border-[rgba(2,43,39,0.35)] px-4 py-2 text-[11px] font-semibold text-[#022B27] transition-colors duration-[var(--t-tap)] hover:bg-[rgba(2,43,39,0.1)]"
    >
      Log in
    </button>
  );
}
