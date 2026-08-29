"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { isSuperAdmin } from "../../lib/permissions";

const NAV_ITEMS = [
  { href: "/platform", label: "Salons" },
  { href: "/platform/monitoring", label: "Monitoring" },
] as const;

/**
 * The platform shell.
 *
 * Deliberately not the salon layout: SUPER_ADMIN holds PLATFORM_ADMIN and no
 * tenant permission at all, so every item in the salon sidebar would be hidden
 * and every request it makes would 403. A separate route group keeps the two
 * applications from pretending to be one.
 *
 * The colour is also deliberately different. Operating the platform and
 * operating a salon are different jobs with different blast radii, and an
 * identical chrome is how someone provisions a tenant thinking they are
 * editing their own opening hours.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }
    // A salon user who lands here has no platform rights; send them home
    // rather than showing a shell whose every request will 403.
    if (!isSuperAdmin(user.roles)) {
      router.replace("/today");
    }
  }, [loading, user, router]);

  if (loading || !user || !isSuperAdmin(user.roles)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-700 bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-semibold text-white">Salon Platform</p>
            <p className="text-xs text-slate-400">Tenant administration</p>
          </div>
          <div className="flex items-center gap-3">
            <p data-testid="current-user" className="text-xs text-slate-300">
              {user.name} · SUPER_ADMIN
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-11 rounded px-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-6">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/platform" ? pathname === "/platform" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`platform-nav-${item.label.toLowerCase()}`}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "border-teal-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
