"use client";

import { useState, type FormEvent } from "react";
import type { BookingWizard } from "../hooks/use-booking-wizard";

const PHONE_PATTERN = /^\+?[0-9\s-]{7,15}$/;

export function CustomerDetailsForm({ wizard }: { wizard: BookingWizard }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  const phoneValid = PHONE_PATTERN.test(phone.trim());
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && phoneValid;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    setPhoneTouched(true);
    if (!canSubmit) {
      return;
    }
    void wizard.submitDetailsAndReserve(
      { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), email: email.trim() || undefined },
      notes.trim(),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Your details</h2>
      <p className="text-sm text-slate-500">No account needed — your booking reference is your access code.</p>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        First name
        <input
          data-testid="customer-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Last name
        <input
          data-testid="customer-last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Phone
        <input
          data-testid="customer-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setPhoneTouched(true)}
          required
          inputMode="tel"
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
        />
        {phoneTouched && !phoneValid ? (
          <span className="text-xs text-red-600">Enter a valid phone number.</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Email (optional)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      {wizard.error ? <p className="text-sm text-red-600">{wizard.error}</p> : null}

      <button
        type="submit"
        data-testid="reserve-slot"
        disabled={!canSubmit || wizard.submitting}
        className="mt-2 min-h-11 rounded-md bg-teal-600 px-4 py-2 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {wizard.submitting ? "Holding your slot…" : "Hold this slot"}
      </button>
    </form>
  );
}
