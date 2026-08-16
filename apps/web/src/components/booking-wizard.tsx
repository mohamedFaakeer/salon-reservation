"use client";

import type { SalonProfile } from "../lib/api-client";
import { useBookingWizard, type WizardStep } from "../hooks/use-booking-wizard";
import { formatPriceCents } from "../lib/format";
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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 pb-24">
      {stepIndex > 0 && wizard.step !== "success" ? (
        <button
          type="button"
          onClick={back}
          className="self-start text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back
        </button>
      ) : null}

      {wizard.step === "services" ? <ServicePicker salon={salon} wizard={wizard} /> : null}
      {wizard.step === "staff" ? <StaffPicker wizard={wizard} /> : null}
      {wizard.step === "date" ? <DatePicker salon={salon} wizard={wizard} /> : null}
      {wizard.step === "slots" ? <SlotGrid wizard={wizard} /> : null}
      {wizard.step === "details" ? <CustomerDetailsForm wizard={wizard} /> : null}
      {wizard.step === "payment" ? <PaymentStep wizard={wizard} /> : null}
      {wizard.step === "success" ? <SuccessScreen wizard={wizard} /> : null}

      {STICKY_BAR_STEPS.has(wizard.step) ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div className="text-sm text-slate-600">
              {wizard.selectedServiceIds.length}{" "}
              {wizard.selectedServiceIds.length === 1 ? "service" : "services"}
              {wizard.totalPriceCents > 0 ? ` · ${formatPriceCents(wizard.totalPriceCents)}` : ""}
            </div>
            <button
              type="button"
              data-testid="wizard-continue"
              onClick={next}
              disabled={!canContinue}
              className="min-h-11 rounded-md bg-teal-600 px-6 py-2 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
