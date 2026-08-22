"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import {
  fetchTenantMe,
  setTenantProfileListener,
  ApiRequestError,
  type ModuleKey,
  type ReportPanelKey,
} from "../../lib/api-client";
import { AppSidebar } from "../../components/app-sidebar";
import { isStaffOnly } from "../../lib/permissions";
import { ModulesProvider } from "../../context/modules-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [salonName, setSalonName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<ModuleKey, boolean> | null>(null);
  const [reportPanels, setReportPanels] = useState<Record<ReportPanelKey, boolean> | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    } else if (isStaffOnly(user.roles)) {
      // Every item in this sidebar is hidden from STAFF and every request it
      // makes would 403 — the same reason SUPER_ADMIN gets its own shell.
      router.replace("/floor");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) {
      return;
    }
    fetchTenantMe()
      .then((res) => {
        setSalonName(res.tenant.name);
        setLogoUrl(res.tenant.logoUrl);
        setModules(res.context.modules);
        setReportPanels(res.context.reportPanels);
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiRequestError)) {
          throw err;
        }
      });
  }, [user]);

  // Settings can rename the salon; the name in the rail is fetched once on
  // mount, so it hears about the change rather than going stale until reload.
  useEffect(() => {
    setTenantProfileListener((tenant) => {
      if (tenant.name !== undefined) {
        setSalonName(tenant.name);
      }
      if (tenant.logoUrl !== undefined) {
        setLogoUrl(tenant.logoUrl);
      }
    });
    return () => setTenantProfileListener(null);
  }, []);

  if (loading || !user || isStaffOnly(user.roles)) {
    return null;
  }

  return (
    // Sidebar beside content on desktop; stacked above it on tablet and
    // narrower, where a fixed 224px rail would eat too much of the board.
    <ModulesProvider value={{ modules, reportPanels }}>
      <div className="min-h-screen bg-slate-100 lg:flex">
        <AppSidebar
          roles={user.roles}
          salonName={salonName}
          logoUrl={logoUrl}
          userName={user.name}
          onLogout={() => void logout()}
        />
        <main className="min-w-0 flex-1 p-6 lg:h-screen lg:overflow-y-auto">{children}</main>
      </div>
    </ModulesProvider>
  );
}
