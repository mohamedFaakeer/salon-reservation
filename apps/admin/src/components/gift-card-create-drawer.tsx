"use client";

import { useState } from "react";
import { ApiRequestError, createGiftCard, type CreateGiftCardInput } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { errorCopy } from "../lib/error-copy";

const PAYMENT_METHODS: Array<{ value: CreateGiftCardInput["paymentMethod"]; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD_CAPTURED", label: "Card" },
];

const MESSAGE_MAX = 120;

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Default expiry: a year out, editable — real gift cards need a real shelf life, not "today plus nothing". */
function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function GiftCardCreateDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [amountRupees, setAmountRupees] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [purchaserFirstName, setPurchaserFirstName] = useState("");
  const [purchaserLastName, setPurchaserLastName] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CreateGiftCardInput["paymentMethod"]>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amountRupees) * 100);
  const valid =
    Number.isFinite(amountCents) &&
    amountCents > 0 &&
    expiresAt.length > 0 &&
    purchaserFirstName.trim().length > 0 &&
    purchaserLastName.trim().length > 0 &&
    purchaserPhone.trim().length >= 5 &&
    message.length <= MESSAGE_MAX;

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createGiftCard(
        {
          amountCents,
          expiresAt,
          purchaser: {
            firstName: purchaserFirstName.trim(),
            lastName: purchaserLastName.trim(),
            phone: purchaserPhone.trim(),
            email: purchaserEmail.trim() || undefined,
          },
          recipientName: recipientName.trim() || undefined,
          recipientPhone: recipientPhone.trim() || undefined,
          recipientEmail: recipientEmail.trim() || undefined,
          message: message.trim() || undefined,
          paymentMethod,
        },
        generateIdempotencyKey(),
      );
      onCreated();
    } catch (err) {
      const copy = errorCopy(err);
      setError(err instanceof ApiRequestError ? err.message : copy.title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Create gift card" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Amount</span>
          <span className="flex items-center gap-2">
            <span className="text-sm text-slate-500">LKR</span>
            <input
              data-testid="gift-card-amount"
              type="number"
              min={1}
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="min-h-11 w-40 rounded border border-slate-300 px-3 text-sm"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Expires on</span>
          <input
            data-testid="gift-card-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Purchaser</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              data-testid="gift-card-purchaser-first-name"
              placeholder="First name"
              value={purchaserFirstName}
              onChange={(e) => setPurchaserFirstName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            <input
              data-testid="gift-card-purchaser-last-name"
              placeholder="Last name"
              value={purchaserLastName}
              onChange={(e) => setPurchaserLastName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </div>
          <input
            data-testid="gift-card-purchaser-phone"
            placeholder="Phone"
            value={purchaserPhone}
            onChange={(e) => setPurchaserPhone(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
          <input
            data-testid="gift-card-purchaser-email"
            placeholder="Email (optional)"
            value={purchaserEmail}
            onChange={(e) => setPurchaserEmail(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">
            Recipient <span className="font-normal text-slate-500">(optional)</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              data-testid="gift-card-recipient-name"
              placeholder="Name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            <input
              data-testid="gift-card-recipient-phone"
              placeholder="Phone"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </div>
          <input
            data-testid="gift-card-recipient-email"
            placeholder="Email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Personal note <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea
            data-testid="gift-card-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            rows={3}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Wishing you a spa day to remember..."
          />
          <span className="flex justify-between text-xs text-slate-400">
            <span>Shown on the card, exactly as typed.</span>
            <span className="tabular-nums">
              {message.length} / {MESSAGE_MAX}
            </span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">How was this paid?</legend>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                data-testid={`gift-card-payment-${m.value}`}
                onClick={() => setPaymentMethod(m.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${
                  paymentMethod === m.value
                    ? "border-teal-600 bg-teal-50 text-teal-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

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
            data-testid="gift-card-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Creating…">
              Create gift card
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
