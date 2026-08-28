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
import { AppTopbar } from "../../components/app-topbar";
import { isStaffOnly } from "../../lib/permissions";
import { ModulesProvider } from "../../context/modules-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [salonName, setSalonName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<ModuleKey, boolean> | null>(null);
  const [reportPanels, setReportPanels] = useState<Record<ReportPanelKey, boolean> | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // Body-scroll lock while the mobile/tablet drawer is open.
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  // Resizing/rotating out to desktop width while the drawer is open must not
  // leave the scroll-lock stuck on — the sidebar's `lg:` classes make it look
  // like the normal static rail again, but body scroll would stay dead.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange(e: MediaQueryListEvent): void {
      if (e.matches) {
        setNavOpen(false);
      }
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
    // Sidebar beside content on desktop (`lg` and up, unchanged). Below `lg`
    // it's an off-canvas drawer (docs/UX.md §5) opened via AppTopbar's
    // hamburger, rather than stacking the whole ~23-item nav above the page.
    <ModulesProvider value={{ modules, reportPanels }}>
      <div className="min-h-screen bg-slate-100 lg:flex">
        <AppTopbar
          salonName={salonName}
          logoUrl={logoUrl}
          open={navOpen}
          onToggle={() => setNavOpen((v) => !v)}
        />
        {/* Scrim: opacity-toggled rather than mounted/unmounted so it fades
            in step with the panel's slide, not a beat behind it. */}
        <div
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className={`fixed inset-0 z-[35] bg-slate-900/40 transition-opacity duration-[var(--motion-overlay)] lg:hidden ${
            navOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <AppSidebar
          roles={user.roles}
          salonName={salonName}
          logoUrl={logoUrl}
          userName={user.name}
          onLogout={() => void logout()}
          open={navOpen}
          onRequestClose={() => setNavOpen(false)}
        />
        <main
          // Removes background content from tab order and the accessibility
          // tree while the drawer is open — `navOpen` can only be true below
          // `lg` (the topbar that sets it is `lg:hidden`), so this never
          // fires at desktop width.
          inert={navOpen}
          className="min-w-0 flex-1 p-6 lg:h-screen lg:overflow-y-auto"
        >
          {children}
        </main>
      </div>
    </ModulesProvider>
  );
}
