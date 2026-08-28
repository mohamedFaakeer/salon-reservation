"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  customerLogin,
  customerLogout,
  customerRefresh,
  type CustomerAccountPublic,
  type CustomerAuthResult,
} from "../lib/api-client";

/** Only the refresh token is persisted — the access token lives in memory only, same posture as a short-lived credential deserves. */
const REFRESH_TOKEN_KEY = "salon.customerRefreshToken";
/** "Never more than once per visit" — a browser tab, not a login session. */
const PROMPT_SHOWN_KEY = "salon.accountPromptShown";
const DWELL_BEFORE_PROMPT_MS = 40_000;

/** Which piece of the account overlay is on screen, if any. One flow, one place it lives. */
export type AccountScreen = "none" | "prompt" | "signup" | "created" | "login" | "otp";

interface CustomerAuthContextValue {
  account: CustomerAccountPublic | null;
  loading: boolean;
  screen: AccountScreen;
  /** The phone the "created"/"otp" screens are about — set once, by whichever flow got them there. */
  pendingPhone: string | null;
  pendingFirstName: string | null;
  goTo: (screen: AccountScreen, context?: { phone?: string; firstName?: string }) => void;
  close: () => void;
  suppressPrompt: () => void;
  login: (phone: string, password: string) => Promise<void>;
  applyVerifiedSession: (result: CustomerAuthResult) => void;
  logout: () => Promise<void>;
  /** Opens straight to the OTP screen for the current account — the booking-confirm button's entry point. */
  openVerifyForCurrentAccount: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<CustomerAccountPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<AccountScreen>("none");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [pendingFirstName, setPendingFirstName] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  // Silent refresh on load — a returning, previously-logged-in customer never
  // has to type anything again as long as the refresh token is still good.
  useEffect(() => {
    const stored = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    customerRefresh(stored)
      .then((res) => {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
        setAccount(res.account);
      })
      .catch(() => {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  // The timed prompt — fires once per tab, only for a logged-out browser, and
  // never once something else (booking in progress, an already-open screen)
  // has claimed the overlay.
  useEffect(() => {
    if (loading || account || suppressed) {
      return;
    }
    if (window.sessionStorage.getItem(PROMPT_SHOWN_KEY)) {
      return;
    }
    const id = window.setTimeout(() => {
      setScreen((current) => {
        if (current !== "none") {
          return current;
        }
        window.sessionStorage.setItem(PROMPT_SHOWN_KEY, "1");
        return "prompt";
      });
    }, DWELL_BEFORE_PROMPT_MS);
    return () => window.clearTimeout(id);
  }, [loading, account, suppressed]);

  const goTo = useCallback((next: AccountScreen, context?: { phone?: string; firstName?: string }) => {
    if (context?.phone !== undefined) {
      setPendingPhone(context.phone);
    }
    if (context?.firstName !== undefined) {
      setPendingFirstName(context.firstName);
    }
    setScreen(next);
  }, []);

  const close = useCallback(() => setScreen("none"), []);

  /** Booking in progress, or the prompt already shown — either way, stop offering it for the rest of this tab. */
  const suppressPrompt = useCallback(() => {
    setSuppressed(true);
    window.sessionStorage.setItem(PROMPT_SHOWN_KEY, "1");
  }, []);

  const applyVerifiedSession = useCallback((result: CustomerAuthResult) => {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setAccount(result.account);
    setScreen("none");
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const result = await customerLogin(phone, password);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setAccount(result.account);
    setScreen("none");
  }, []);

  const logout = useCallback(async () => {
    const stored = window.localStorage.getItem(REFRESH_TOKEN_KEY) ?? undefined;
    try {
      await customerLogout(stored);
    } catch {
      // Best-effort — the local session ends either way.
    }
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccount(null);
  }, []);

  const openVerifyForCurrentAccount = useCallback(() => {
    if (!account) {
      return;
    }
    setPendingPhone(account.phone);
    setScreen("otp");
  }, [account]);

  return (
    <CustomerAuthContext.Provider
      value={{
        account,
        loading,
        screen,
        pendingPhone,
        pendingFirstName,
        goTo,
        close,
        suppressPrompt,
        login,
        applyVerifiedSession,
        logout,
        openVerifyForCurrentAccount,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return ctx;
}
