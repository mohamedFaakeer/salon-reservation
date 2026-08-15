"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchNotifications,
  retryNotification,
  type NotificationRecord,
} from "../../../lib/api-client";
import { formatTime } from "../../../lib/format";
import { canManageNotifications } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { LoadingSkeleton } from "../../../components/loading-skeleton";

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const canRetry = canManageNotifications(user?.roles ?? []);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchNotifications()
      .then((res) => setNotifications(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load notifications.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRetry(id: string): Promise<void> {
    setRetryingId(id);
    try {
      await retryNotification(id);
      load();
    } catch {
      // The row's own status (still FAILED) already reflects the outcome — no separate error UI needed.
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <EmptyState title={error} action={{ label: "Retry", onClick: load }} />
      ) : notifications.length === 0 ? (
        <EmptyState title="No notifications yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2">Recipient</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} data-testid={`notification-row-${n.id}`} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{formatTime(n.createdAt)}</td>
                  <td className="px-4 py-2">{n.type}</td>
                  <td className="px-4 py-2">{n.channel}</td>
                  <td className="px-4 py-2 text-slate-600">{n.recipient}</td>
                  <td className="px-4 py-2">
                    <span
                      data-testid={`notification-status-${n.id}`}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[n.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {canRetry && n.status === "FAILED" ? (
                      <button
                        type="button"
                        data-testid={`retry-notification-${n.id}`}
                        disabled={retryingId === n.id}
                        onClick={() => void handleRetry(n.id)}
                        className="rounded border border-teal-600 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                      >
                        {retryingId === n.id ? "Retrying…" : "Retry"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
