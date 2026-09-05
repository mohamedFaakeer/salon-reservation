"use client";

import { useEffect, useState } from "react";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import {
  createNotificationTemplate,
  updateNotificationTemplate,
  type CreateNotificationTemplateInput,
  type NotificationTemplateRecord,
  type UpdateNotificationTemplateInput,
} from "../lib/api-client";

type NotificationChannel = "console" | "email" | "sms" | "whatsapp";

const EVENT_OPTIONS = [
  { value: "BOOKING_CONFIRMATION", label: "Booking Confirmation" },
  { value: "APPOINTMENT_REMINDER", label: "Appointment Reminder" },
  { value: "APPOINTMENT_RESCHEDULED", label: "Appointment Rescheduled" },
  { value: "APPOINTMENT_CANCELLED", label: "Appointment Cancelled" },
  { value: "PAYMENT_RECEIPT", label: "Payment Receipt" },
  { value: "WINBACK_CAMPAIGN", label: "Win-back Campaign" },
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

export function NotificationTemplateDrawer({
  isOpen,
  onClose,
  template,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  template: NotificationTemplateRecord | null;
  onSaved: () => void;
}) {
  const isEditing = !!template;

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("BOOKING_CONFIRMATION");
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setEventType(template.eventType);
      setChannel(template.channel);
      setSubject(template.subject || "");
      setBody(template.body || "");
    } else {
      setName("");
      setEventType("BOOKING_CONFIRMATION");
      setChannel("email");
      setSubject("Your booking with {{salonName}} is confirmed");
      setBody("Hi {{customerName}},\n\nYour appointment is confirmed for {{serviceNames}} on {{appointmentDate}} at {{appointmentTime}} with {{staffName}}.\n\nBooking reference: {{bookingReference}}\n\nThank you,\n{{salonName}}");
    }
    setError(null);
  }, [template, isOpen]);

  if (!isOpen) return null;

  function insertVariable(v: string) {
    setBody((prev) => `${prev} {{${v}}}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a template name.");
      return;
    }
    if (!body.trim()) {
      setError("Please enter template body content.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditing && template) {
        const updateInput: UpdateNotificationTemplateInput = {
          name: name.trim(),
          subject: channel === "email" ? subject.trim() || undefined : undefined,
          body: body.trim(),
        };
        await updateNotificationTemplate(template.id, updateInput);
      } else {
        const createInput: CreateNotificationTemplateInput = {
          name: name.trim(),
          eventType,
          channel,
          subject: channel === "email" ? subject.trim() || undefined : undefined,
          body: body.trim(),
        };
        await createNotificationTemplate(createInput);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell title={isEditing ? "Edit Template" : "Create Template"} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-5 p-6 text-sm">
        {error ? (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{error}</div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Template Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Booking Confirmation"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Event Trigger</label>
              <select
                disabled={isEditing}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
              >
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Channel</label>
              <select
                disabled={isEditing}
                value={channel}
                onChange={(e) => setChannel(e.target.value as NotificationChannel)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {channel === "email" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Booking Confirmed - {{salonName}}"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Template Body</label>
              <span className="text-[11px] text-slate-400">Handlebars syntax</span>
            </div>
            <textarea
              rows={6}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
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
              {isEditing ? "Save Changes" : "Create Template"}
            </BusyLabel>
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}
