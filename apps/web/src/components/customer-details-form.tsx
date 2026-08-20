"use client";

import { useId, useState, type FormEvent } from "react";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { BusyLabel } from "./spinner";
import { DyeButton } from "./cloth";

const PHONE_PATTERN = /^\+?[0-9\s-]{7,15}$/;

export function CustomerDetailsForm({ wizard }: { wizard: BookingWizard }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneErrorId = useId();

  const phoneValid = PHONE_PATTERN.test(phone.trim());
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && phoneValid;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    setPhoneTouched(true);
    if (!canSubmit) {
      return;
    }
    void wizard.submitDetailsAndReserve(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      },
      notes.trim(),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="display text-[28px] text-[var(--ink)]">
        Almost
        <span className="block">yours.</span>
      </h2>
      <p className="text-[13px] text-[#5E6B60]">
        No account. Your booking reference is the only thing you need to keep.
      </p>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
        First name
        <input
          data-testid="customer-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.16)] bg-white/60 px-3.5 text-[15px] font-normal text-[var(--ink)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--indigo)]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
        Last name
        <input
          data-testid="customer-last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.16)] bg-white/60 px-3.5 text-[15px] font-normal text-[var(--ink)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--indigo)]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
        Phone
        <input
          data-testid="customer-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setPhoneTouched(true)}
          required
          inputMode="tel"
          // Without aria-invalid + aria-describedby the message below is
          // visible but unreachable: a screen reader announces the field as
          // valid and never reads the reason the form won't submit.
          aria-invalid={phoneTouched && !phoneValid}
          aria-describedby={phoneTouched && !phoneValid ? phoneErrorId : undefined}
          className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.16)] bg-white/60 px-3.5 text-[15px] font-normal text-[var(--ink)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--indigo)]"
        />
        {phoneTouched && !phoneValid ? (
          <span id={phoneErrorId} role="alert" className="text-xs text-red-600">
            Enter a valid phone number.
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
        Email (optional)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.16)] bg-white/60 px-3.5 text-[15px] font-normal text-[var(--ink)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--indigo)]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.16)] bg-white/60 px-3.5 py-2.5 text-[15px] font-normal text-[var(--ink)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--indigo)]"
        />
      </label>

      {wizard.error ? (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-[#B3261E] bg-[rgba(179,38,30,0.08)] p-3 text-[13px] font-semibold text-[#8C1D18]">
          {wizard.error}
        </p>
      ) : null}

      <DyeButton
        type="submit"
        testId="reserve-slot"
        disabled={!canSubmit || wizard.submitting}
        className="mt-2 w-full"
      >
        <BusyLabel busy={wizard.submitting} busyText="Holding it…">
          Hold this slot
        </BusyLabel>
      </DyeButton>
    </form>
  );
}
