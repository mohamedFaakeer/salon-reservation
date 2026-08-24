"use client";

import { useState } from "react";
import {
  sendTestNotification,
  type TestNotificationInput,
  type TestNotificationResult,
} from "../lib/api-client";
import { BusyLabel } from "./spinner";

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

export function NotificationTestModal({
  isOpen,
  onClose,
  initialTemplate,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTemplate?: {
    subject?: string;
    body?: string;
    eventType?: string;
  };
}) {
  const [eventType, setEventType] = useState(initialTemplate?.eventType || "BOOKING_CONFIRMATION");
  const [channels, setChannels] = useState<("console" | "email" | "sms" | "whatsapp")[]>(["console", "email"]);
  const [subject, setSubject] = useState(initialTemplate?.subject || "");
  const [body, setBody] = useState(
    initialTemplate?.body || "Hello {{customerName}}, your appointment for {{serviceNames}} is confirmed on {{appointmentDate}} at {{appointmentTime}}."
  );
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestNotificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function toggleChannel(channel: "console" | "email" | "sms" | "whatsapp") {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  }

  async function handleSendTest() {
    if (channels.length === 0) {
      setError("Please select at least one channel.");
      return;
    }
    setTesting(true);
    setError(null);
    setResult(null);

    const input: TestNotificationInput = {
      eventType,
      channels,
      templateSubject: subject.trim() || undefined,
      templateBody: body.trim(),
    };

    try {
      const res = await sendTestNotification(input);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to run test notification.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Test Notification</h3>
            <p className="text-xs text-slate-500">Preview rendering and trigger a test send with sample data</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Event Trigger</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Channels</label>
              <div className="flex flex-wrap gap-2 pt-1">
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
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Subject Template (Email)</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Appointment Confirmation - {{salonName}}"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Body Template (Handlebars)</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}

          {result ? (
            <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Render Result (Sample Data)
                </span>
                <span className="rounded bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                  Success
                </span>
              </div>
              {result.renderedSubject ? (
                <div>
                  <span className="text-[11px] font-medium text-slate-500">Subject:</span>
                  <p className="text-xs font-semibold text-slate-900">{result.renderedSubject}</p>
                </div>
              ) : null}
              <div>
                <span className="text-[11px] font-medium text-slate-500">Rendered Body:</span>
                <div className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-800 shadow-sm border border-slate-200 font-mono">
                  {result.renderedBody}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <BusyLabel busy={testing} busyText="Testing…">
              Send Test Notification
            </BusyLabel>
          </button>
        </div>
      </div>
    </div>
  );
}
