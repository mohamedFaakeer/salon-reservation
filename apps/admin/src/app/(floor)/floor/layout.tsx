"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth-context";
import {
  fetchTenantMe,
  setTenantProfileListener,
  ApiRequestError,
  type ModuleKey,
  type ReportPanelKey,
} from "../../../lib/api-client";
import { isStaffOnly } from "../../../lib/permissions";
import { FloorNav } from "../../../components/floor-nav";
import { ModulesProvider } from "../../../context/modules-context";

/**
 * The floor shell — a phone-first kiosk, not the desk sidebar shrunk down.
 *
 * Deliberately its own route group, same reasoning as the platform shell:
 * STAFF holds none of the permissions the desk sidebar is built from, so
 * every item there would be hidden and every request it made would 403. An
 * elevated login (owner/manager/receptionist) is sent back to the desk —
 * this surface is for the person standing on the floor, not the person
 * running the salon.
 */
export default function FloorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [salonName, setSalonName] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [modules, setModules] = useState<Record<ModuleKey, boolean> | null>(null);
  const [reportPanels, setReportPanels] = useState<Record<ReportPanelKey, boolean> | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    } else if (!isStaffOnly(user.roles)) {
      router.replace("/today");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !isStaffOnly(user.roles)) {
      return;
    }
    fetchTenantMe()
      .then((res) => {
        setSalonName(res.tenant.name);
        setModules(res.context.modules);
        setReportPanels(res.context.reportPanels);
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiRequestError)) {
          throw err;
        }
      });
  }, [user]);

  useEffect(() => {
    setTenantProfileListener((tenant) => {
      if (tenant.name !== undefined) {
        setSalonName(tenant.name);
      }
    });
    return () => setTenantProfileListener(null);
  }, []);

  // The live clock is a real affordance here, not decoration: a punch is
  // stamped by the server, and seeing the same minute tick on screen is what
  // tells someone the tap landed rather than lagged.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading || !user || !isStaffOnly(user.roles)) {
    return null;
  }

  const logoutButton = (
    <button
      type="button"
      onClick={() => void logout()}
      aria-label="Log out"
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
    >
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none" aria-hidden="true">
        <path
          d="M6.5 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v8.4a1.3 1.3 0 0 0 1.3 1.3h2.7M10.5 11l3-3-3-3M13.3 8H6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  // The floor kiosk today is entirely attendance (Today/History/Requests)
  // plus incentives (Earnings) — with attendance off there is nothing here
  // for this login to do, so the kiosk itself doesn't render.
  if (modules && !modules.attendance) {
    return (
      <div className="mx-auto flex h-dvh max-w-md flex-col bg-slate-100">
        <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
          <p className="truncate text-xs font-semibold text-slate-500">{salonName ?? " "}</p>
          {logoutButton}
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[15px] font-semibold text-slate-900">
            Attendance isn&apos;t included in your salon&apos;s plan.
          </p>
          <p className="text-sm text-slate-500">Ask your manager if you think this should be turned on.</p>
        </main>
      </div>
    );
  }

  return (
    <ModulesProvider value={{ modules, reportPanels }}>
      <div className="mx-auto flex h-dvh max-w-md flex-col bg-slate-100">
        <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-500">{salonName ?? " "}</p>
          </div>
          <div className="flex items-center gap-3">
            {now ? (
              <span className="tabular text-xs font-semibold text-slate-900">
                {now.toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
            {logoutButton}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</main>
        <FloorNav />
      </div>
    </ModulesProvider>
  );
}
