"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  deleteNotificationRule,
  deleteNotificationTemplate,
  fetchNotificationEventSettings,
  fetchNotificationQuota,
  fetchNotificationRules,
  fetchNotifications,
  fetchNotificationTemplates,
  fetchTenantSettings,
  retryNotification,
  updateNotificationEventSetting,
  updateNotificationRule,
  updateNotificationTemplate,
  updateTenantSettings,
  type NotificationEventSettingRecord,
  type NotificationQuotaRecord,
  type NotificationRecord,
  type NotificationRuleRecord,
  type NotificationTemplateRecord,
} from "../../../lib/api-client";
import { formatTime } from "../../../lib/format";
import { canConfigureNotifications, canManageNotifications } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { BusyLabel } from "../../../components/spinner";
import { NotificationQuotaCard } from "../../../components/notification-quota-card";
import { NotificationRuleDrawer } from "../../../components/notification-rule-drawer";
import { NotificationTemplateDrawer } from "../../../components/notification-template-drawer";
import { NotificationTestModal } from "../../../components/notification-test-modal";

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
  BOUNCED: "bg-slate-100 text-slate-700",
};

const CHANNEL_STYLES: Record<string, string> = {
  console: "bg-slate-100 text-slate-700",
  email: "bg-indigo-100 text-indigo-800",
  sms: "bg-teal-100 text-teal-800",
  whatsapp: "bg-emerald-100 text-emerald-800",
};

/** One row per `NotificationEvent` — what triggers it, in the Owner's own terms, not the enum name. */
const EVENT_TYPE_INFO: Record<string, { label: string; description: string }> = {
  BOOKING_CONFIRMATION: { label: "Booking confirmation", description: "Sent the moment a new appointment is booked." },
  PAYMENT_CONFIRMATION: { label: "Payment confirmation", description: "Sent when a payment is recorded against an appointment." },
  REMINDER_24H: { label: "24-hour reminder", description: "Sent about a day before an upcoming appointment." },
  REMINDER_2H: { label: "2-hour reminder", description: "Sent a couple of hours before an upcoming appointment." },
  CANCELLATION_CONFIRMATION: { label: "Cancellation confirmation", description: "Sent when an appointment is cancelled." },
  RESCHEDULE_CONFIRMATION: { label: "Reschedule confirmation", description: "Sent when an appointment is moved to a new time." },
  NO_SHOW: { label: "No-show notice", description: "Sent when a customer is marked as a no-show." },
  LATE_ARRIVAL: { label: "Late arrival notice", description: "Sent when a customer's late arrival is noted." },
  WINBACK_OFFER: { label: "Win-back offer", description: "The message sent from Reports → Worth a call to a lapsed customer." },
};

function humanize(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const canManage = canManageNotifications(user?.roles ?? []);
  const canConfigure = canConfigureNotifications(user?.roles ?? []);

  const [activeTab, setActiveTab] = useState<"types" | "rules" | "templates" | "logs" | "settings">("rules");

  // Notification bell settings — currently just the pop-up master switch;
  // the badge/drawer itself always reflects reality and has no override.
  const [popupsEnabled, setPopupsEnabled] = useState(true);
  const [bellSettingsLoading, setBellSettingsLoading] = useState(true);
  const [savingBellSetting, setSavingBellSetting] = useState(false);

  // Notification Types state — per-event kill switch (DECISIONS.md §40)
  const [eventSettings, setEventSettings] = useState<NotificationEventSettingRecord[]>([]);
  const [eventSettingsLoading, setEventSettingsLoading] = useState(true);
  const [togglingEventType, setTogglingEventType] = useState<string | null>(null);

  // Rules state
  const [rules, setRules] = useState<NotificationRuleRecord[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<NotificationRuleRecord | null>(null);
  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplateRecord[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplateRecord | null>(null);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);

  // Activity Logs state
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Quota state
  const [quota, setQuota] = useState<NotificationQuotaRecord | null>(null);

  // Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testInitialData, setTestInitialData] = useState<{ subject?: string; body?: string; eventType?: string } | undefined>(undefined);

  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(() => {
    setRulesLoading(true);
    fetchNotificationRules()
      .then((res) => setRules(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load notification rules.");
      })
      .finally(() => setRulesLoading(false));
  }, []);

  const loadTemplates = useCallback(() => {
    setTemplatesLoading(true);
    fetchNotificationTemplates()
      .then((res) => setTemplates(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load templates.");
      })
      .finally(() => setTemplatesLoading(false));
  }, []);

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    fetchNotifications()
      .then((res) => setNotifications(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load notification logs.");
      })
      .finally(() => setLogsLoading(false));
  }, []);

  const loadQuota = useCallback(() => {
    fetchNotificationQuota()
      .then((res) => setQuota(res))
      .catch(() => {});
  }, []);

  const loadEventSettings = useCallback(() => {
    setEventSettingsLoading(true);
    fetchNotificationEventSettings()
      .then(setEventSettings)
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load notification types.");
      })
      .finally(() => setEventSettingsLoading(false));
  }, []);

  const loadBellSettings = useCallback(() => {
    setBellSettingsLoading(true);
    fetchTenantSettings()
      .then((res) => setPopupsEnabled(res.staffNotificationPopupsEnabled ?? true))
      .catch(() => {})
      .finally(() => setBellSettingsLoading(false));
  }, []);

  useEffect(() => {
    loadEventSettings();
    loadRules();
    loadTemplates();
    loadLogs();
    loadQuota();
    loadBellSettings();
  }, [loadEventSettings, loadRules, loadTemplates, loadLogs, loadQuota, loadBellSettings]);

  async function handleToggleBellPopups(next: boolean): Promise<void> {
    setSavingBellSetting(true);
    const previous = popupsEnabled;
    setPopupsEnabled(next);
    try {
      await updateTenantSettings({ staffNotificationPopupsEnabled: next });
    } catch (err: unknown) {
      setPopupsEnabled(previous);
      alert(err instanceof Error ? err.message : "Failed to update this setting.");
    } finally {
      setSavingBellSetting(false);
    }
  }

  async function handleToggleEventSetting(setting: NotificationEventSettingRecord) {
    setTogglingEventType(setting.eventType);
    try {
      await updateNotificationEventSetting(setting.eventType, !setting.isEnabled);
      loadEventSettings();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update this notification type.");
    } finally {
      setTogglingEventType(null);
    }
  }

  async function handleRetry(id: string): Promise<void> {
    setRetryingId(id);
    try {
      await retryNotification(id);
      loadLogs();
    } catch {
      // Ignored: row's own status already reflects failure
    } finally {
      setRetryingId(null);
    }
  }

  async function handleToggleRule(rule: NotificationRuleRecord) {
    try {
      await updateNotificationRule(rule.id, { isEnabled: !rule.isEnabled });
      loadRules();
    } catch {
      // Error handling
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm("Are you sure you want to delete this notification rule?")) return;
    try {
      await deleteNotificationRule(id);
      loadRules();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete rule.");
    }
  }

  async function handleToggleTemplate(template: NotificationTemplateRecord) {
    try {
      await updateNotificationTemplate(template.id, { isEnabled: !template.isEnabled });
      loadTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update template.");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteNotificationTemplate(id);
      loadTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete template.");
    }
  }

  function handleOpenTestForRule(rule: NotificationRuleRecord) {
    setTestInitialData({
      eventType: rule.eventType || "APPOINTMENT_REMINDER",
      subject: rule.templateSubject || "",
      body: rule.templateBody || "",
    });
    setIsTestModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Notifications & Messaging</h1>
          <p className="text-xs text-slate-500">
            Configure automated customer messaging, triggers, templates, and track delivery across channels.
          </p>
        </div>

        {canConfigure && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTestInitialData(undefined);
                setIsTestModalOpen(true);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Test Notification
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedRule(null);
                setIsRuleDrawerOpen(true);
              }}
              className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              + Create Rule
            </button>
          </div>
        )}
      </div>

      {/* Quota Overview Card */}
      <NotificationQuotaCard quota={quota} />

      {error ? (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => setActiveTab("types")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "types"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Notification Types
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("rules")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "rules"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Notification Rules ({rules.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "templates"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Templates ({templates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "logs"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Activity Log ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "settings"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Settings
        </button>
      </div>

      {/* Tab: Notification Types — per-event kill switch */}
      {activeTab === "types" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Turn a message off entirely and it stops sending, on every channel, everywhere it would otherwise fire —
            not just a starting-point template you can still edit.
          </p>
          {eventSettingsLoading ? (
            <TableSkeleton />
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {eventSettings.map((setting) => {
                const info = EVENT_TYPE_INFO[setting.eventType] ?? {
                  label: humanize(setting.eventType),
                  description: "",
                };
                return (
                  <div key={setting.eventType} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{info.label}</p>
                      {info.description ? <p className="text-xs text-slate-500">{info.description}</p> : null}
                    </div>
                    {canConfigure ? (
                      <button
                        type="button"
                        disabled={togglingEventType === setting.eventType}
                        onClick={() => handleToggleEventSetting(setting)}
                        aria-label={setting.isEnabled ? `Turn off ${info.label}` : `Turn on ${info.label}`}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-wait disabled:opacity-60 ${
                          setting.isEnabled ? "bg-teal-700" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                            setting.isEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    ) : (
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          setting.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {setting.isEnabled ? "On" : "Off"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Rules */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {rulesLoading ? (
            <TableSkeleton />
          ) : rules.length === 0 ? (
            <EmptyState
              title="No notification rules configured."
              action={
                canConfigure
                  ? {
                      label: "Create your first rule",
                      onClick: () => {
                        setSelectedRule(null);
                        setIsRuleDrawerOpen(true);
                      },
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{r.name}</h3>
                        <span className="inline-block mt-0.5 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {humanize(r.eventType || "APPOINTMENT_REMINDER")}
                        </span>
                      </div>
                      {canConfigure && (
                        <button
                          type="button"
                          onClick={() => handleToggleRule(r)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            r.isEnabled ? "bg-teal-700" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                              r.isEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-800 border border-teal-100">
                        {r.timingType === "BEFORE_APPT"
                          ? `${r.timingValue?.offsetHours ?? 24}h before appt`
                          : r.timingType === "AFTER_BOOKING"
                          ? `Immediately on booking`
                          : r.timingType === "AFTER_COMPLETION"
                          ? `${r.timingValue?.delayMinutes ?? 0}m after completion`
                          : "Day of appointment"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {r.channels.map((ch) => (
                        <span
                          key={ch}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            CHANNEL_STYLES[ch] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {ch}
                        </span>
                      ))}
                    </div>

                    <p className="line-clamp-2 text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-100">
                      {r.templateBody}
                    </p>
                  </div>

                  {canConfigure && (
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenTestForRule(r)}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRule(r);
                          setIsRuleDrawerOpen(true);
                        }}
                        className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(r.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Templates */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Reusable message templates with variable tokens</p>
            {canConfigure && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplate(null);
                  setIsTemplateDrawerOpen(true);
                }}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                + Create Template
              </button>
            )}
          </div>

          {templatesLoading ? (
            <TableSkeleton />
          ) : templates.length === 0 ? (
            <EmptyState title="No templates found." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-medium uppercase text-slate-500 bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-2.5">Template Name</th>
                    <th className="px-4 py-2.5">Event</th>
                    <th className="px-4 py-2.5">Channel</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Preview</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                      <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{humanize(t.eventType)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                            CHANNEL_STYLES[t.channel] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.isSystem ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            System Default
                          </span>
                        ) : (
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate font-mono text-xs text-slate-500">
                        {t.body}
                      </td>
                      <td className="px-4 py-3">
                        {canConfigure ? (
                          <button
                            type="button"
                            onClick={() => handleToggleTemplate(t)}
                            aria-label={t.isEnabled ? `Disable ${t.name}` : `Enable ${t.name}`}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              t.isEnabled ? "bg-teal-700" : "bg-slate-200"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                                t.isEnabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        ) : (
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                              t.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {t.isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canConfigure && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTemplate(t);
                                setIsTemplateDrawerOpen(true);
                              }}
                              className="rounded border border-teal-600 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                            >
                              Edit
                            </button>
                            {!t.isSystem && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(t.id)}
                                className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Activity Logs */}
      {activeTab === "logs" && (
        <div>
          {logsLoading ? (
            <TableSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState title="No notifications sent yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-medium uppercase text-slate-500 bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-2.5">When</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Channel</th>
                    <th className="px-4 py-2.5">Recipient</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n, i) => (
                    <tr
                      key={n.id}
                      data-testid={`notification-row-${n.id}`}
                      className="motion-rise border-b border-slate-100"
                      style={{ animationDelay: `${Math.min(i, 4) * 45}ms` }}
                    >
                      <td className="px-4 py-2.5 text-slate-500">{formatTime(n.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium">{humanize(n.type)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
                            CHANNEL_STYLES[n.channel.toLowerCase()] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {n.channel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{n.recipient}</td>
                      <td className="px-4 py-2.5">
                        <span
                          data-testid={`notification-status-${n.id}`}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[n.status] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {humanize(n.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canManage && n.status === "FAILED" ? (
                          <button
                            type="button"
                            data-testid={`retry-notification-${n.id}`}
                            disabled={retryingId === n.id}
                            onClick={() => void handleRetry(n.id)}
                            className="rounded border border-teal-600 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                          >
                            <BusyLabel busy={retryingId === n.id} busyText="Retrying…">
                              Retry
                            </BusyLabel>
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
      )}

      {/* Tab: Settings — the notification bell's pop-up switch */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            The bell icon and its unread badge always reflect what actually happened and can&apos;t be turned off.
            This only governs the pop-up alert that appears when a new online booking, cancellation, or reschedule
            comes in.
          </p>
          {bellSettingsLoading ? (
            <TableSkeleton />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Show pop-up alerts</p>
                  <p className="text-xs text-slate-500">
                    A brief on-screen alert for new online bookings, cancellations, and reschedules.
                  </p>
                </div>
                {canConfigure ? (
                  <button
                    type="button"
                    disabled={savingBellSetting}
                    onClick={() => void handleToggleBellPopups(!popupsEnabled)}
                    aria-label={popupsEnabled ? "Turn off pop-up alerts" : "Turn on pop-up alerts"}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-wait disabled:opacity-60 ${
                      popupsEnabled ? "bg-teal-700" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                        popupsEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                ) : (
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                      popupsEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {popupsEnabled ? "On" : "Off"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawers and Modals */}
      <NotificationRuleDrawer
        isOpen={isRuleDrawerOpen}
        onClose={() => setIsRuleDrawerOpen(false)}
        rule={selectedRule}
        onSaved={loadRules}
      />

      <NotificationTemplateDrawer
        isOpen={isTemplateDrawerOpen}
        onClose={() => setIsTemplateDrawerOpen(false)}
        template={selectedTemplate}
        onSaved={loadTemplates}
      />

      <NotificationTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        initialTemplate={testInitialData}
      />
    </div>
  );
}
