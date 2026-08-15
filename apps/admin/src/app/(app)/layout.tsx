"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { fetchTenantMe, ApiRequestError } from "../../lib/api-client";
import { canManageNotifications } from "../../lib/permissions";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [salonName, setSalonName] = useState<string | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) {
      return;
    }
    fetchTenantMe()
      .then((res) => setSalonName(res.tenant.name))
      .catch((err: unknown) => {
        if (!(err instanceof ApiRequestError)) {
          throw err;
        }
      });
  }, [user]);

  if (loading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900">{salonName ?? "Salon Admin"}</span>
          <a href="/today" className="text-sm font-medium text-teal-700 hover:text-teal-800">
            Today
          </a>
          {canManageNotifications(user.roles) ? (
            <a href="/notifications" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Notifications
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span data-testid="current-user">
            {user.name} · {user.roles.join(", ")}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
