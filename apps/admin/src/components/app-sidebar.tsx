"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  canManageAppointments,
  canManageCustomers,
  canManageNotifications,
  canManageServices,
  canManageSettings,
  canManageStaff,
  canManageTeam,
  canViewAudit,
  canViewDashboard,
  canViewReports,
} from "../lib/permissions";

/**
 * Primary navigation.
 *
 * UX.md §4.1 lists eleven destinations, which is far past what the previous
 * two-link header could carry. They are grouped by the job the operator came
 * to do rather than listed flat — a wall of eleven equal items makes the two
 * you need daily as hard to find as the one you need yearly.
 *
 * Items a role cannot use are omitted entirely rather than shown disabled,
 * matching how Notifications already behaved for STAFF. Hiding is a
 * convenience only: every route's data is re-authorised server-side.
 */

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  visible: (roles: string[]) => boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        href: "/today",
        label: "Today",
        visible: canViewDashboard,
        icon: (
          <Icon>
            <rect x="2" y="3" width="12" height="11" rx="2" {...stroke} />
            <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/schedule",
        label: "Schedule",
        visible: canViewDashboard,
        icon: (
          <Icon>
            <rect x="2" y="3.5" width="12" height="10" rx="1.8" {...stroke} />
            <path d="M2 7h12" {...stroke} />
            <path d="M6 10h4" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/appointments",
        label: "Appointments",
        visible: canManageAppointments,
        icon: (
          <Icon>
            <path d="M4 2.5v11M12 2.5v11M2.5 6h11" {...stroke} />
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...stroke} />
          </Icon>
        ),
      },
    ],
  },
  {
    label: "Insight",
    items: [
      {
        href: "/reports",
        label: "Reports",
        visible: canViewReports,
        icon: (
          <Icon>
            <path d="M2.5 13.5V2.5M2.5 13.5h11" {...stroke} />
            <path d="M5.5 11V8M8.5 11V4.5M11.5 11V6.5" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/audit",
        label: "Audit",
        visible: canViewAudit,
        icon: (
          <Icon>
            <path d="M3 13V3M3 13h10" {...stroke} />
            <path d="M6 10V7M9 10V5M12 10V8" {...stroke} />
          </Icon>
        ),
      },
    ],
  },
  {
    label: "Salon setup",
    items: [
      {
        href: "/services",
        label: "Services",
        visible: canManageServices,
        icon: (
          <Icon>
            <path d="m4 11 7-7M6.5 3.5 4 6 2.5 4.5 5 2z" {...stroke} />
            <path d="m10 9.5 3 3-1 1-3-3" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/staff",
        label: "Staff & skills",
        visible: canManageStaff,
        icon: (
          <Icon>
            <circle cx="6" cy="6" r="2.4" {...stroke} />
            <path d="M2 13c.7-1.9 2.2-2.9 4-2.9s3.3 1 4 2.9" {...stroke} />
            <path d="M11 5.5h3M12.5 4v3" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/availability",
        label: "Availability",
        visible: canManageStaff,
        icon: (
          <Icon>
            <rect x="2" y="3.5" width="12" height="10" rx="1.8" {...stroke} />
            <path d="M2 7h12" {...stroke} />
            <path d="M6 10h4" {...stroke} />
          </Icon>
        ),
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/team",
        label: "Staff logins",
        visible: canManageTeam,
        icon: (
          <Icon>
            <circle cx="6.4" cy="5.6" r="2.3" {...stroke} />
            <path d="M2.4 13c.7-2 2.2-3 4-3s3.3 1 4 3" {...stroke} />
            <path d="M11 8.6a2 2 0 1 0 0-3.6" {...stroke} />
            <path d="M12.2 13c-.2-.9-.5-1.7-1-2.3" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/customers",
        label: "Customers",
        visible: canManageCustomers,
        icon: (
          <Icon>
            <circle cx="8" cy="5.6" r="2.4" {...stroke} />
            <path d="M3.4 13c.8-2.1 2.6-3.2 4.6-3.2s3.8 1.1 4.6 3.2" {...stroke} />
          </Icon>
        ),
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/payments",
        label: "Payments",
        visible: canManageAppointments,
        icon: (
          <Icon>
            <rect x="2.5" y="4" width="11" height="9" rx="1.5" {...stroke} />
            <path d="M2.5 7h11" {...stroke} />
            <path d="M6 10h2" {...stroke} />
          </Icon>
        ),
      },
      {
        href: "/settings",
        label: "Settings",
        visible: canManageSettings,
        icon: (
          <Icon>
            <circle cx="8" cy="8" r="2.1" {...stroke} />
            <path
              d="M8 1.8v1.4M8 12.8v1.4M2.6 8H4m8 0h1.4M4.2 4.2l1 1m5.6 5.6 1 1m0-7.6-1 1m-5.6 5.6-1 1"
              {...stroke}
            />
          </Icon>
        ),
      },
      {
        href: "/notifications",
        label: "Notifications",
        visible: canManageNotifications,
        icon: (
          <Icon>
            <path d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4z" {...stroke} />
            <path d="M6.8 13a1.3 1.3 0 0 0 2.4 0" {...stroke} />
          </Icon>
        ),
      },
    ],
  },
];

export function AppSidebar({
  roles,
  salonName,
  userName,
  onLogout,
}: {
  roles: string[];
  salonName: string | null;
  userName: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.visible(roles)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:h-screen lg:w-56 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="truncate text-sm font-semibold text-slate-900">{salonName ?? "Salon Admin"}</p>
        <p className="truncate text-xs text-slate-500">{roles.join(", ")}</p>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="px-4 pb-1 text-[10px] font-medium uppercase tracking-[0.13em] text-slate-400">
              {group.label}
            </p>
            <ul className="flex flex-col">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-testid={`nav-${item.href.slice(1)}`}
                      className={`flex min-h-11 items-center gap-2.5 border-l-2 px-4 text-sm transition-colors ${
                        active
                          ? "border-teal-600 bg-teal-50 font-semibold text-teal-700"
                          : "border-transparent text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={active ? "text-teal-600" : "text-slate-400"}>{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2">
        <p data-testid="current-user" className="min-w-0 truncate text-xs text-slate-600">
          <span className="block truncate font-medium text-slate-900">{userName}</span>
          {roles.join(", ")}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="min-h-11 shrink-0 rounded px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
