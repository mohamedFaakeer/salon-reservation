"use client";

import { useEffect, useState } from "react";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import {
  createNotificationRule,
  fetchServices,
  fetchStaff,
  updateNotificationRule,
  type CreateNotificationRuleInput,
  type NotificationRuleRecord,
  type ServiceItem,
  type StaffMember,
  type UpdateNotificationRuleInput,
} from "../lib/api-client";

const EVENT_OPTIONS = [
  { value: "BOOKING_CONFIRMATION", label: "Booking Confirmation" },
  { value: "APPOINTMENT_REMINDER", label: "Appointment Reminder" },
  { value: "APPOINTMENT_RESCHEDULED", label: "Appointment Rescheduled" },
  { value: "APPOINTMENT_CANCELLED", label: "Appointment Cancelled" },
  { value: "PAYMENT_RECEIPT", label: "Payment Receipt" },
  { value: "WINBACK_CAMPAIGN", label: "Win-back Campaign" },
];

type TimingType = "BEFORE_APPT" | "DAY_OF_APPT" | "AFTER_BOOKING" | "AFTER_COMPLETION";

const TIMING_OPTIONS = [
  { value: "BEFORE_APPT", label: "Before Appointment" },
  { value: "DAY_OF_APPT", label: "Day of Appointment (Morning)" },
  { value: "AFTER_BOOKING", label: "Immediately / Delay After Booking" },
  { value: "AFTER_COMPLETION", label: "After Appointment Completed" },
];

const CHANNELS: Array<{ id: "console" | "email" | "sms" | "whatsapp"; label: string }> = [
  { id: "console", label: "Console" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "WhatsApp" },
];

const TEMPLATE_VARIABLES = [
  { key: "customerName", label: "Customer Name" },
  { key: "appointmentDate", label: "Date" },
  { key: "appointmentTime", label: "Time" },
  { key: "staffName", label: "Staff Name" },
  { key: "serviceNames", label: "Services" },
  { key: "salonName", label: "Salon Name" },
  { key: "salonPhone", label: "Salon Phone" },
  { key: "bookingReference", label: "Reference" },
  { key: "totalAmount", label: "Total Amount" },
  { key: "cancelUrl", label: "Cancel Link" },
  { key: "rescheduleUrl", label: "Reschedule Link" },
  { key: "reviewUrl", label: "Review Link" },
];

export function NotificationRuleDrawer({
  isOpen,
  onClose,
  rule,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  rule: NotificationRuleRecord | null;
  onSaved: () => void;
}) {
  const isEditing = !!rule;

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("APPOINTMENT_REMINDER");
  const [timingType, setTimingType] = useState<TimingType>("BEFORE_APPT");
  const [offsetHours, setOffsetHours] = useState("24");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [channels, setChannels] = useState<("console" | "email" | "sms" | "whatsapp")[]>(["console", "sms"]);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [priority, setPriority] = useState("0");
  const [isEnabled, setIsEnabled] = useState(true);

  // Targeting filters
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [minTotalAmount, setMinTotalAmount] = useState("");

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [serviceList, setServiceList] = useState<ServiceItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchStaff().then(setStaffList).catch(() => {});
      fetchServices().then(setServiceList).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setEventType(rule.eventType || "APPOINTMENT_REMINDER");
      setTimingType(rule.timingType);
      setOffsetHours(String(rule.timingValue?.offsetHours ?? 24));
      setDelayMinutes(String(rule.timingValue?.delayMinutes ?? 0));
      setChannels(rule.channels ?? ["console"]);
      setTemplateSubject(rule.templateSubject || "");
      setTemplateBody(rule.templateBody || "");
      setPriority(String(rule.priority ?? 0));
      setIsEnabled(rule.isEnabled ?? true);
      setSelectedStaffIds(rule.targeting?.staffIds || []);
      setSelectedServiceIds(rule.targeting?.serviceIds || []);
      setIsNewCustomer(!!rule.targeting?.isNewCustomer);
      setMinTotalAmount(rule.targeting?.minTotalAmount ? String(rule.targeting.minTotalAmount) : "");
    } else {
      setName("");
      setEventType("APPOINTMENT_REMINDER");
      setTimingType("BEFORE_APPT");
      setOffsetHours("24");
      setDelayMinutes("0");
      setChannels(["console", "sms"]);
      setTemplateSubject("Reminder: Your appointment with {{salonName}}");
      setTemplateBody("Hi {{customerName}}, this is a reminder for your {{serviceNames}} on {{appointmentDate}} at {{appointmentTime}} with {{staffName}}.");
      setPriority("0");
      setIsEnabled(true);
      setSelectedStaffIds([]);
      setSelectedServiceIds([]);
      setIsNewCustomer(false);
      setMinTotalAmount("");
    }
    setError(null);
  }, [rule, isOpen]);

  if (!isOpen) return null;

  function toggleChannel(ch: "console" | "email" | "sms" | "whatsapp") {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  function insertVariable(v: string) {
    setTemplateBody((prev) => `${prev} {{${v}}}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a rule name.");
      return;
    }
    if (channels.length === 0) {
      setError("Please select at least one delivery channel.");
      return;
    }
    if (!templateBody.trim()) {
      setError("Please enter a message template body.");
      return;
    }

    setSaving(true);
    setError(null);

    const timingValue: Record<string, unknown> = {};
    if (timingType === "BEFORE_APPT") {
      timingValue.offsetHours = parseFloat(offsetHours) || 24;
    } else if (timingType === "AFTER_BOOKING" || timingType === "AFTER_COMPLETION") {
      timingValue.delayMinutes = parseInt(delayMinutes, 10) || 0;
    }

    const targeting: Record<string, unknown> = {};
    if (selectedStaffIds.length > 0) targeting.staffIds = selectedStaffIds;
    if (selectedServiceIds.length > 0) targeting.serviceIds = selectedServiceIds;
    if (isNewCustomer) targeting.isNewCustomer = true;
    if (minTotalAmount.trim()) targeting.minTotalAmount = parseFloat(minTotalAmount);

    try {
      if (isEditing && rule) {
        const updateInput: UpdateNotificationRuleInput = {
          name: name.trim(),
          eventType,
          timingType,
          timingValue,
          channels,
          templateSubject: templateSubject.trim() || undefined,
          templateBody: templateBody.trim(),
          targeting,
          priority: parseInt(priority, 10) || 0,
          isEnabled,
        };
        await updateNotificationRule(rule.id, updateInput);
      } else {
        const createInput: CreateNotificationRuleInput = {
          name: name.trim(),
          eventType,
          timingType,
          timingValue,
          channels,
          templateSubject: templateSubject.trim() || undefined,
          templateBody: templateBody.trim(),
          targeting,
          priority: parseInt(priority, 10) || 0,
          isEnabled,
        };
        await createNotificationRule(createInput);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save notification rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell title={isEditing ? "Edit Notification Rule" : "Create Notification Rule"} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-5 p-6 text-sm">
        {error ? (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{error}</div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Rule Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 24h SMS Reminder"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Event Trigger</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Timing Type</label>
              <select
                value={timingType}
                onChange={(e) => setTimingType(e.target.value as TimingType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {TIMING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {timingType === "BEFORE_APPT" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Hours Before Appointment</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={offsetHours}
                  onChange={(e) => setOffsetHours(e.target.value)}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <span className="text-xs text-slate-500">hours before start time</span>
              </div>
            </div>
          )}

          {(timingType === "AFTER_BOOKING" || timingType === "AFTER_COMPLETION") && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Delay After Trigger (Minutes)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(e.target.value)}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <span className="text-xs text-slate-500">minutes</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Delivery Channels</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHANNELS.map((ch) => {
                const active = channels.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-teal-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              Targeting Criteria (Optional)
            </h4>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isNewCustomer}
                  onChange={(e) => setIsNewCustomer(e.target.checked)}
                  className="rounded text-teal-700 focus:ring-teal-500"
                />
                Apply only to first-time (new) customers
              </label>

              {staffList.length > 0 && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600">Limit to Staff</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {staffList.map((s) => {
                      const selected = selectedStaffIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setSelectedStaffIds((prev) =>
                              selected ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                            )
                          }
                          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                            selected
                              ? "bg-teal-100 font-semibold text-teal-800 border border-teal-300"
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {serviceList.length > 0 && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600">Limit to Services</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {serviceList.map((srv) => {
                      const selected = selectedServiceIds.includes(srv.id);
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() =>
                            setSelectedServiceIds((prev) =>
                              selected ? prev.filter((id) => id !== srv.id) : [...prev, srv.id]
                            )
                          }
                          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                            selected
                              ? "bg-teal-100 font-semibold text-teal-800 border border-teal-300"
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {srv.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Subject (Email Only)</label>
            <input
              type="text"
              value={templateSubject}
              onChange={(e) => setTemplateSubject(e.target.value)}
              placeholder="e.g. Appointment reminder - {{salonName}}"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Message Body Template</label>
              <span className="text-[11px] text-slate-400">Handlebars syntax</span>
            </div>
            <textarea
              rows={4}
              required
              value={templateBody}
              onChange={(e) => setTemplateBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="self-center text-[11px] text-slate-400">Insert tag:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 hover:bg-teal-50 hover:text-teal-800"
                >
                  +{v.key}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="rounded text-teal-700 focus:ring-teal-500"
              />
              Rule is active and enabled
            </label>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Priority:</span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-xs"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <BusyLabel busy={saving} busyText="Saving…">
              {isEditing ? "Save Changes" : "Create Rule"}
            </BusyLabel>
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}
