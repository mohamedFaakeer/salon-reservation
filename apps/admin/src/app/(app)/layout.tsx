"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { NotificationBell } from "../../components/notification-bell";
import { isStaffOnly } from "../../lib/permissions";
import { ModulesProvider } from "../../context/modules-context";
import { TourProvider } from "../../context/tour-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [salonName, setSalonName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<ModuleKey, boolean> | null>(null);
  const [reportPanels, setReportPanels] = useState<Record<ReportPanelKey, boolean> | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  /**
   * Auto-collapses the desktop rail 5s after landing on the dashboard, so
   * the day board is fully visible without the user doing anything — then
   * gets out of the way. Any manual click on the brand row (see
   * `handleToggleCollapse`) cancels this so it never fights the user's own
   * choice later in the session.
   */
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    autoCollapseTimer.current = setTimeout(() => setCollapsed(true), 5_000);
    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
      }
    };
  }, []);

  function handleToggleCollapse(): void {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
    setCollapsed((v) => !v);
  }

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
    <TourProvider>
      <div className="min-h-screen bg-slate-100 lg:flex">
        <NotificationBell />
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
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <div className="flex min-w-0 flex-1 flex-col lg:h-screen">
          {/*
            A real, in-flow strip — not decoration around a still-fixed bell.
            `<main>` starts below it in normal flow, so no page's own header
            (the Today board's "New booking" button included) can ever end up
            underneath the bell again, regardless of that page's own layout.
            `NotificationBell` portals its desktop trigger button into this
            div (see notification-bell.tsx) so there is still one shared
            component/state for the bell, not two. Fixed at 40px so the
            topbar reads identically on every page — the bell inside is sized
            to match (see notification-bell.tsx's `BellIcon`).
          */}
          <div
            id="desktop-bell-slot"
            className="hidden shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 lg:flex lg:h-10"
          />
          <main
            // Removes background content from tab order and the accessibility
            // tree while the drawer is open — `navOpen` can only be true below
            // `lg` (the topbar that sets it is `lg:hidden`), so this never
            // fires at desktop width.
            inert={navOpen}
            className="min-w-0 flex-1 overflow-y-auto p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </TourProvider>
    </ModulesProvider>
  );
}
