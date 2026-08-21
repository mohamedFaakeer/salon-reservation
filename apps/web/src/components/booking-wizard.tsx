"use client";

import type { SalonProfile } from "../lib/api-client";
import { useBookingWizard, type WizardStep } from "../hooks/use-booking-wizard";
import { formatPriceCents } from "../lib/format";
import { DyeButton } from "./cloth";
import { ServicePicker } from "./service-picker";
import { StaffPicker } from "./staff-picker";
import { DatePicker } from "./date-picker";
import { SlotGrid } from "./slot-grid";
import { CustomerDetailsForm } from "./customer-details-form";
import { PaymentStep } from "./payment-step";
import { SuccessScreen } from "./success-screen";

const STEP_ORDER: WizardStep[] = [
  "services",
  "staff",
  "date",
  "slots",
  "details",
  "payment",
  "success",
];

const STICKY_BAR_STEPS = new Set<WizardStep>(["services", "staff", "date"]);

export function BookingWizard({ salon }: { salon: SalonProfile }) {
  const wizard = useBookingWizard(salon);
  const stepIndex = STEP_ORDER.indexOf(wizard.step);

  function next(): void {
    const target = STEP_ORDER[stepIndex + 1];
    if (target) {
      wizard.goTo(target);
    }
  }

  function back(): void {
    const target = STEP_ORDER[stepIndex - 1];
    if (target) {
      wizard.goTo(target);
    }
  }

  const canContinue =
    wizard.step === "services"
      ? wizard.selectedServiceIds.length > 0
      : wizard.step === "date"
        ? Boolean(wizard.selectedDate)
        : true;

  const STEP_LABELS: Record<WizardStep, string> = {
    services: "Services",
    staff: "Stylist",
    date: "Day",
    slots: "Time",
    details: "Details",
    payment: "Pay",
    success: "Booked",
  };
  const visibleSteps = STEP_ORDER.filter((s) => s !== "success");

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      {wizard.step !== "success" ? (
        <div className="flex items-center gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={back}
              aria-label="Back a step"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[rgba(18,48,44,0.16)] text-[var(--ink)] transition-colors duration-[var(--t-tap)] hover:bg-[rgba(18,48,44,0.06)]"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          {/* The progress bar is the only place step order is stated; it is a
              real sequence, so the segments carry information rather than
              decorating the header. */}
          <ol
            className="flex flex-1 gap-1.5"
            aria-label={`Step ${stepIndex + 1} of ${visibleSteps.length}: ${STEP_LABELS[wizard.step]}`}
          >
            {visibleSteps.map((s, i) => (
              <li
                key={s}
                aria-current={s === wizard.step ? "step" : undefined}
                className={`h-[3px] flex-1 rounded-full transition-colors duration-[var(--t-state)] ${
                  i < stepIndex
                    ? "bg-[var(--dye)]"
                    : i === stepIndex
                      ? "bg-[var(--bloom)]"
                      : "bg-[rgba(18,48,44,0.14)]"
                }`}
              >
                <span className="sr-only">{STEP_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div key={wizard.step} className="anim-rise">
        {wizard.step === "services" ? <ServicePicker salon={salon} wizard={wizard} /> : null}
        {wizard.step === "staff" ? <StaffPicker wizard={wizard} /> : null}
        {wizard.step === "date" ? <DatePicker salon={salon} wizard={wizard} /> : null}
        {wizard.step === "slots" ? <SlotGrid wizard={wizard} /> : null}
        {wizard.step === "details" ? <CustomerDetailsForm wizard={wizard} /> : null}
        {wizard.step === "payment" ? <PaymentStep wizard={wizard} /> : null}
        {wizard.step === "success" ? <SuccessScreen wizard={wizard} /> : null}
      </div>

      {STICKY_BAR_STEPS.has(wizard.step) ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[rgba(240,231,214,0.18)] bg-[var(--dye-deep)] px-5 py-3">
          <div className="mx-auto flex max-w-lg items-center gap-4">
            <div className="min-w-0 flex-1">
              <span className="display tabular block text-[16px] text-[var(--resist)]">
                {wizard.totalPriceCents > 0 ? formatPriceCents(wizard.totalPriceCents) : "Nothing picked"}
              </span>
              <span className="block text-[11px] text-[var(--resist-dim)]">
                {wizard.selectedServiceIds.length}{" "}
                {wizard.selectedServiceIds.length === 1 ? "service" : "services"}
                {/*
                  The running total is the list price on purpose. An offer
                  depends on the time chosen, and no time is chosen yet — a
                  lower figure here that rose at checkout would be a bait.
                  This only ever surprises in the customer's favour.
                */}
                {wizard.hasOfferOnSelection ? " · offers apply at some times" : null}
              </span>
            </div>
            <DyeButton testId="wizard-continue" onClick={next} disabled={!canContinue}>
              Continue
            </DyeButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
