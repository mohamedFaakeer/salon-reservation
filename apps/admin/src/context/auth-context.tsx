"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as api from "../lib/api-client";
import type { AuthUser } from "../lib/api-client";

const STORAGE_KEY = "salon_admin_session";

interface StoredSession {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    const session: StoredSession = { accessToken: res.accessToken, user: res.user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    api.setAuthToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }, [clearSession, router]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
