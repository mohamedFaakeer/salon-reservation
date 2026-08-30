"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as api from "../lib/api-client";
import type { AuthUser, FirstLoginChallenge, LoginResponse } from "../lib/api-client";

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

  useEffect(() => {
    api.setUnauthorizedHandler(handleUnauthorized);
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
    return () => api.setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  const establishSession = useCallback((res: LoginResponse): AuthUser => {
    const session: StoredSession = { accessToken: res.accessToken, user: res.user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    api.setAuthToken(res.accessToken);
    setUser(res.user);
    // Returned rather than read from state: setUser has not committed yet when
    // the caller needs to decide where to send them.
    return res.user;
  }, []);

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

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithSession: establishSession, logout }}>
      {children}
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
