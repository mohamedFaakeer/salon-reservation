"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ModuleKey, ReportPanelKey } from "../lib/api-client";

export interface ResolvedModules {
  modules: Record<ModuleKey, boolean> | null;
  reportPanels: Record<ReportPanelKey, boolean> | null;
}

const ModulesContext = createContext<ResolvedModules>({ modules: null, reportPanels: null });

/**
 * Populated once by `(app)/layout.tsx` and `(floor)/floor/layout.tsx` from
 * the same `fetchTenantMe()` call each already makes for the salon name — no
 * second request. Consumed anywhere that needs to hide something a tenant's
 * plan doesn't include: the sidebar, the floor nav, `ModuleGate`-wrapped
 * pages, and the invoice panel inside the appointment detail drawer.
 */
export function ModulesProvider({ value, children }: { value: ResolvedModules; children: ReactNode }) {
  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

/**
 * `null` fields mean "not loaded yet" — every reader treats that as "assume
 * allowed" rather than blocking, so the common case (a PRO tenant, which is
 * every tenant that existed before this shipped) never flashes a locked state
 * while the request is in flight. The server enforces the real check
 * regardless; this is convenience, not the boundary.
 */
export function useModules(): ResolvedModules {
  return useContext(ModulesContext);
}
