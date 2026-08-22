"use client";

import { useState } from "react";
import { ApiRequestError, sendWinbackCampaign, type LapsedCustomerRow, type WinbackResult } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { errorCopy } from "../lib/error-copy";

const MESSAGE_MAX = 500;
const TOKENS = ["{firstName}", "{salonName}"];

function defaultTemplate(): string {
  return "Hi {firstName}, it's been a while since your last visit to {salonName}! We'd love to see you again soon — book your next appointment whenever suits you.";
}

/**
 * Turns "Worth a call" into a sent message. Compose, then a result state
 * showing exactly who was reached and who was skipped and why — a batch
 * send always resolves to that breakdown, never a bare toast.
 */
export function WinbackCampaignDrawer({
  customers,
  onClose,
  onSent,
}: {
  customers: LapsedCustomerRow[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState(defaultTemplate());
  const [giftCardCode, setGiftCardCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WinbackResult | null>(null);

  const nameById = new Map(customers.map((c) => [c.customerId, c.name]));
  const valid = message.trim().length >= 10;

  function insertToken(token: string): void {
    setMessage((m) => (m.length === 0 || m.endsWith(" ") ? `${m}${token}` : `${m} ${token}`).slice(0, MESSAGE_MAX));
  }

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await sendWinbackCampaign({
        customerIds: customers.map((c) => c.customerId),
        message: message.trim(),
        giftCardCode: giftCardCode.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      const copy = errorCopy(err);
      setError(err instanceof ApiRequestError ? err.message : copy.title);
    } finally {
      setSubmitting(false);
    }
  }

  function finish(): void {
    onSent();
    onClose();
  }

  if (result) {
    return (
      <DrawerShell title="Message sent" onClose={finish}>
        <div className="flex flex-col gap-3">
          {result.sent.length > 0 ? (
            <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
              <span aria-hidden="true">✓</span>
              <span>
                <strong>
                  Sent to {result.sent.length} customer{result.sent.length === 1 ? "" : "s"}.
                </strong>{" "}
                {result.sent.map((id) => nameById.get(id) ?? id).join(", ")}
              </span>
            </div>
          ) : null}
          {result.skippedOptedOut.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <strong className="text-slate-700">
                Skipped — asked not to be contacted ({result.skippedOptedOut.length})
              </strong>
              <br />
              {result.skippedOptedOut.map((id) => nameById.get(id) ?? id).join(", ")}
            </div>
          ) : null}
          {result.skippedRecentlyContacted.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <strong className="text-slate-700">
                Skipped — contacted recently ({result.skippedRecentlyContacted.length})
              </strong>
              <br />
              {result.skippedRecentlyContacted.map((id) => nameById.get(id) ?? id).join(", ")}
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            Full delivery detail, including retries, is in Notifications.
          </p>
          <button
            type="button"
            data-testid="winback-done"
            onClick={finish}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell title="Send win-back message" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">To</span>
          <div>
            {customers.map((c) => (
              <span
                key={c.customerId}
                className="mb-1.5 mr-1.5 inline-block rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700"
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Message</span>
          <textarea
            data-testid="winback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            rows={5}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap gap-1.5">
              {TOKENS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => insertToken(t)}
                  className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100"
                >
                  + {t}
                </button>
              ))}
            </span>
            <span className="text-xs tabular-nums text-slate-400">
              {message.length} / {MESSAGE_MAX}
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Include a gift card code <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="winback-gift-card-code"
            value={giftCardCode}
            onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
            placeholder="ELE-GC-XXXXXXXXXX"
            className="min-h-11 rounded border border-slate-300 px-3 font-mono text-sm uppercase"
          />
        </label>
        <p className="-mt-2 text-xs text-slate-500">
          Paste a code you&apos;ve already created in Gift Cards — it&apos;ll be dropped into the message.
        </p>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="winback-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Sending…">
              Send to {customers.length} customer{customers.length === 1 ? "" : "s"}
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
