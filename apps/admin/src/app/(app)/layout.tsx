"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { fetchTenantMe, ApiRequestError } from "../../lib/api-client";
import { AppSidebar } from "../../components/app-sidebar";

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
    // Sidebar beside content on desktop; stacked above it on tablet and
    // narrower, where a fixed 224px rail would eat too much of the board.
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AppSidebar
        roles={user.roles}
        salonName={salonName}
        userName={user.name}
        onLogout={() => void logout()}
      />
      <main className="min-w-0 flex-1 p-6 lg:h-screen lg:overflow-y-auto">{children}</main>
    </div>
  );
}
