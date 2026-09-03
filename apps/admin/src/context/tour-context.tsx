"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import { toursForRoles, getTour, type TourDef } from "../lib/tours/registry";
import { getTourProgress, setTourProgress, type TourProgressStatus } from "../lib/tour-progress";

interface TourContextValue {
  /** Tours structurally relevant to the signed-in user's roles, catalog order. */
  toursForCurrentUser: TourDef[];
  statusOf: (tourId: string) => TourProgressStatus | "not-started";
  /** No-op if a tour is already running, or the id doesn't resolve to one. */
  startTour: (tourId: string) => void;
  /** Non-null while driver.js is actually on screen — used to disable Start while one is already running. */
  activeTourId: string | null;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Mounted once in `(app)/layout.tsx`, next to `ModulesProvider`. Owns which
 * tours exist for this user and their completed/skipped state — the actual
 * driver.js engine is loaded lazily (see `startTour`) so nothing here costs
 * anything on a page where no tour is ever opened.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  // Bumped after a tour finishes so `statusOf` recomputes from localStorage
  // rather than reading a value captured before the write happened.
  const [progressVersion, setProgressVersion] = useState(0);

  const toursForCurrentUser = useMemo(
    () => (user ? toursForRoles(user.roles) : []),
    [user],
  );

  const statusOf = useCallback(
    (tourId: string): TourProgressStatus | "not-started" => {
      void progressVersion;
      if (!user) {
        return "not-started";
      }
      return getTourProgress(user.tenantId, user.id, tourId) ?? "not-started";
    },
    [user, progressVersion],
  );

  const startTour = useCallback(
    (tourId: string) => {
      const tour = getTour(tourId);
      if (!tour || !user || activeTourId) {
        return;
      }
      setActiveTourId(tourId);
      import("../lib/tours/engine")
        .then(({ runTour }) => {
          runTour(tour, {
            navigate: (route) => router.push(route),
            onFinish: (status) => {
              setTourProgress(user.tenantId, user.id, tourId, status);
              setProgressVersion((v) => v + 1);
              setActiveTourId(null);
            },
          });
        })
        .catch(() => {
          // Failed to even load the engine chunk (offline, blocked script) —
          // fail quiet rather than leaving Start permanently disabled.
          setActiveTourId(null);
        });
    },
    [user, router, activeTourId],
  );

  const value = useMemo(
    () => ({ toursForCurrentUser, statusOf, startTour, activeTourId }),
    [toursForCurrentUser, statusOf, startTour, activeTourId],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return ctx;
}
