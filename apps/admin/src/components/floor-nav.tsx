"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The floor's own bottom nav — three destinations, thumb-reachable, nothing
 * more. UX.md's touch-target floor (44px) is the minimum here, not the
 * target: this is reached one-handed, sometimes with wet hands, so every hit
 * area is generous.
 */
const ITEMS: Array<{ href: string; label: string; icon: ReactNode }> = [
  {
    href: "/floor",
    label: "Today",
    icon: (
      <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/floor/history",
    label: "History",
    icon: (
      <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M8 4v4.3l2.8 1.7M14 8A6 6 0 1 1 6.6 2.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M2.3 2.6v2.8h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/floor/requests",
    label: "Requests",
    icon: (
      <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M3 2.5h10v11l-2.5-1.5-2.5 1.5-2.5-1.5L3 13.5v-11Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M5.5 6h5M5.5 8.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/floor/earnings",
    label: "Earnings",
    icon: (
      <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 4.6v6.8M6 6.4c0-.9.9-1.6 2-1.6s2 .7 2 1.6-.9 1.4-2 1.6c-1.1.2-2 .7-2 1.6s.9 1.6 2 1.6 2-.7 2-1.6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function FloorNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      {ITEMS.map((item) => {
        const active = item.href === "/floor" ? pathname === "/floor" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              active ? "text-teal-700" : "text-slate-400"
            }`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${active ? "bg-teal-100" : ""}`}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
