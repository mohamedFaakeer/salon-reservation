"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as api from "../lib/api-client";
import type { AuthUser, FirstLoginChallenge, LoginResponse } from "../lib/api-client";
import { useIdleTimeout } from "../lib/use-idle-timeout";
import { IdleWarningDialog } from "../components/idle-warning-dialog";

const STORAGE_KEY = "salon_admin_session";

interface StoredSession {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Resolves with the signed-in user so the caller can route by role — or,
   * when the current password was set by someone else (creation, or a
   * reset), a change-token instead. No session is established in that case
   * until the caller redeems it via `loginWithSession` (DECISIONS.md,
   * account-lockout-v2: zero functional access until the change happens).
   */
  login: (email: string, password: string) => Promise<AuthUser | FirstLoginChallenge>;
  /** Establishes the session from an already-completed login response — used after the forced first-login password change succeeds. */
  loginWithSession: (result: LoginResponse) => AuthUser;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    api.setAuthToken(null);
    setUser(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [clearSession, router]);

  const establishSession = useCallback((res: LoginResponse): AuthUser => {
    const session: StoredSession = { accessToken: res.accessToken, user: res.user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    api.setAuthToken(res.accessToken);
    setUser(res.user);
    // Returned rather than read from state: setUser has not committed yet when
    // the caller needs to decide where to send them.
    return res.user;
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(handleUnauthorized);
    // A background silent refresh (api-client's `fetchWithAuthRetry`, or the
    // idle-warning dialog's "Stay signed in" button) renews the session the
    // same way a real login does, so it stays invisible to the rest of the app.
    api.setSessionRefreshedListener(establishSession);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const session = JSON.parse(raw) as StoredSession;
        api.setAuthToken(session.accessToken);
        setUser(session.user);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
    return () => {
      api.setUnauthorizedHandler(null);
      api.setSessionRefreshedListener(null);
    };
  }, [handleUnauthorized, establishSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser | FirstLoginChallenge> => {
      const res = await api.login(email, password);
      if ("requiresPasswordChange" in res) {
        // No session established — the caller must redeem the change-token
        // via loginWithSession before anything else is possible.
        return res;
      }
      return establishSession(res);
    },
    [establishSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }, [clearSession, router]);

  // Idle (inactivity) timeout — separate from, and shorter than, the
  // server-side token/absolute-session-cap machinery in api-client.ts. Only
  // runs once someone is actually signed in.
  const { warningSecondsLeft, stayActive } = useIdleTimeout(user !== null, logout);

  const handleStayActive = useCallback(async () => {
    stayActive();
    try {
      // Renews the session right now rather than waiting for the next
      // request to silently refresh, so "Stay signed in" visibly extends
      // the session instead of merely resetting the idle clock.
      establishSession(await api.refreshSession());
    } catch {
      // The refresh token itself is gone (e.g. the 12-hour absolute session
      // cap was already reached) — there's no session left to keep alive.
      await logout();
    }
  }, [stayActive, establishSession, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithSession: establishSession, logout }}>
      {children}
      {warningSecondsLeft !== null ? (
        <IdleWarningDialog secondsLeft={warningSecondsLeft} onStayActive={handleStayActive} />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
