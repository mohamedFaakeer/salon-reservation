"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStaffNotificationStatus,
  fetchStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  setStaffNotificationSettingsListener,
  type StaffNotificationRecord,
} from "../lib/api-client";
import { formatRelativeTime } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { EmptyState } from "./empty-state";
import { Spinner } from "./spinner";

/**
 * Polling, not a socket — no real-time infrastructure exists anywhere in
 * this codebase today, and Render's free-tier services sleep after 15
 * minutes idle, which fights a persistent connection. A cheap `COUNT` every
 * 25s costs nothing and needs zero new infrastructure (DECISIONS.md).
 */
const POLL_MS = 25_000;
/** How long the new-booking popup stays up before it decays on its own. */
const POPUP_AUTO_DISMISS_MS = 8_000;
const PAGE_SIZE = 20;

const TYPE_ICON: Record<StaffNotificationRecord["type"], string> = {
  APPOINTMENT_CREATED_ONLINE: "✓",
  APPOINTMENT_CANCELLED_SELF: "✕",
  APPOINTMENT_RESCHEDULED_SELF: "↻",
};

/**
 * The notification bell — a fixed-position element layered over content at
 * every breakpoint, deliberately not folded into the sidebar/topbar chrome.
 * The admin app has no persistent desktop top bar today (`AppTopbar` is
 * `lg:hidden`), and restructuring `(app)/layout.tsx` to add one would shift
 * every existing page's layout for a feature that is supposed to be
 * additive (DECISIONS.md).
 *
 * Mounted once in `(app)/layout.tsx` — the desk shell (owner/manager/
 * receptionist). Not mounted in the floor kiosk: that surface is phone-first
 * attendance chrome with no room for extra chrome, and "a customer booked
 * online" is a front-desk concern, not a floor one.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [popupsEnabled, setPopupsEnabled] = useState(true);
  const [popup, setPopup] = useState<StaffNotificationRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const lastSeenId = useRef<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissPopup = useCallback(() => {
    setPopup(null);
    if (popupTimer.current) {
      clearTimeout(popupTimer.current);
      popupTimer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const status = await fetchStaffNotificationStatus();
      setCount(status.count);

      // Only a genuinely new arrival triggers the popup — never the first
      // poll after a page load, which would otherwise re-announce whatever
      // was already unread before this tab was even open.
      if (
        hasLoadedOnce.current &&
        status.latest &&
        status.latest.id !== lastSeenId.current &&
        status.showPopup
      ) {
        setPopup(status.latest);
        if (popupTimer.current) {
          clearTimeout(popupTimer.current);
        }
        popupTimer.current = setTimeout(() => setPopup(null), POPUP_AUTO_DISMISS_MS);
      }
      lastSeenId.current = status.latest?.id ?? lastSeenId.current;
      hasLoadedOnce.current = true;
    } catch {
      // A missed poll is invisible by design — the next one 25s later
      // catches up, and there is nothing actionable to show the operator.
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Settings tab's "show pop-up alerts" toggle pushes here the moment it
  // saves, same mechanism `setTenantProfileListener` already uses for the
  // sidebar's name/logo — without it, turning the toggle off would only
  // take effect on this bell's next full page load.
  useEffect(() => {
    setStaffNotificationSettingsListener(setPopupsEnabled);
    return () => setStaffNotificationSettingsListener(null);
  }, []);

  useEffect(() => () => dismissPopup(), [dismissPopup]);

  return (
    <>
      {/*
        Below `lg`, `AppTopbar` already occupies the top-right corner with
        its hamburger button (both `sticky top-0`, same z-30) — the bell
        sits to its left there instead of on top of it, and only claims the
        corner outright at `lg` where no topbar exists. `z-[31]` keeps it
        above that topbar but below the mobile nav scrim (z-[35]), so
        opening the nav drawer dims the bell along with everything else.
      */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="fixed right-16 top-2 z-[31] flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-50 hover:text-slate-900 lg:right-4 lg:top-4 lg:h-11 lg:w-11"
      >
        <BellIcon />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {popupsEnabled && popup ? (
        <div
          role="status"
          className="motion-rise fixed right-4 top-14 z-[31] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl lg:top-[72px]"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm text-teal-700">
              {TYPE_ICON[popup.type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{popup.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">{popup.body}</p>
            </div>
            <button
              type="button"
              onClick={dismissPopup}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {drawerOpen ? (
        <NotificationDrawer
          onClose={() => setDrawerOpen(false)}
          onReadStateChanged={() => void poll()}
        />
      ) : null}
    </>
  );
}

function NotificationDrawer({
  onClose,
  onReadStateChanged,
}: {
  onClose: () => void;
  onReadStateChanged: () => void;
}) {
  const [items, setItems] = useState<StaffNotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback((offset: number) => {
    setLoading(true);
    setError(null);
    fetchStaffNotifications({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setItems((prev) => (offset === 0 ? res.data : [...prev, ...res.data]));
        setTotal(res.meta.total);
      })
      .catch(() => setError("Couldn't load notifications. Try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  async function handleItemClick(item: StaffNotificationRecord): Promise<void> {
    if (item.read) {
      return;
    }
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    onReadStateChanged();
    try {
      await markStaffNotificationRead(item.id);
    } catch {
      // The badge count will self-correct on the next poll either way.
    }
  }

  async function handleMarkAllRead(): Promise<void> {
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    onReadStateChanged();
    try {
      await markAllStaffNotificationsRead();
    } catch {
      // Same self-correcting reasoning as a single mark-read.
    } finally {
      setMarkingAll(false);
    }
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <DrawerShell title="Notifications" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <p className="text-xs text-slate-500">Online bookings, cancellations, and reschedules.</p>
        {hasUnread ? (
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void handleMarkAllRead()}
            className="shrink-0 text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-60"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex justify-center py-10 text-slate-400">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No notifications yet." />
        </div>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void handleItemClick(item)}
                className={`flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-slate-50 ${
                  item.read ? "" : "bg-teal-50/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-teal-600"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${item.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatRelativeTime(item.createdAt)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && items.length > 0 && items.length < total ? (
        <button
          type="button"
          onClick={() => load(items.length)}
          className="mt-3 self-center text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          Load more
        </button>
      ) : null}
    </DrawerShell>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M10 2.5c-2.3 0-4.2 1.9-4.2 4.2v2.6c0 .5-.2 1-.5 1.4l-1 1.3c-.5.6-.1 1.5.7 1.5h11.9c.8 0 1.2-.9.7-1.5l-1-1.3c-.3-.4-.5-.9-.5-1.4V6.7c0-2.3-1.9-4.2-4.2-4.2h-1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.3 16.3a1.7 1.7 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
