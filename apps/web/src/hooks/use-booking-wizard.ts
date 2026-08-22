"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  cancelHold,
  confirmPayment,
  createBooking,
  fetchAvailability,
  previewGiftCard,
  type AvailabilitySlot,
  type ConfirmResponse,
  type CustomerDetailsInput,
  type GiftCardPreview,
  type ReserveResponse,
  type SalonProfile,
} from "../lib/api-client";
import { colomboToday } from "../lib/format";

export type WizardStep =
  "services" | "staff" | "date" | "slots" | "details" | "payment" | "success";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The wizard's state machine (UX.md §3: services -> staff -> date -> slots ->
 * details -> payment -> success). No business logic lives here beyond
 * sequencing — every value shown (price, availability, hold status) comes
 * straight from the server (CLAUDE.md "no client-side business logic").
 */
export function useBookingWizard(salon: SalonProfile) {
  const [step, setStep] = useState<WizardStep>("services");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = "Any Available Staff"
  const [selectedDate, setSelectedDate] = useState<string>(colomboToday());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotTakenNotice, setSlotTakenNotice] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [customer, setCustomer] = useState<CustomerDetailsInput | null>(null);
  const [notes, setNotes] = useState("");
  const [idempotencyKey] = useState(generateIdempotencyKey);
  const [hold, setHold] = useState<ReserveResponse | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giftCardCode, setGiftCardCodeRaw] = useState("");
  const [giftCardPreview, setGiftCardPreview] = useState<GiftCardPreview | null>(null);
  const [giftCardChecking, setGiftCardChecking] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardApplied, setGiftCardApplied] = useState(false);

  const selectedServices = useMemo(
    () => salon.services.filter((s) => selectedServiceIds.includes(s.id)),
    [salon.services, selectedServiceIds],
  );
  const totalDurationMin = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);
  // List price, deliberately. What an offer actually takes off depends on
  // the slot, which the server prices once one is chosen.
  const totalPriceCents = selectedServices.reduce((sum, s) => sum + s.priceCents, 0);
  const hasOfferOnSelection = selectedServices.some((s) => Boolean(s.discount));

  const qualifiedStaff = useMemo(() => {
    // A staff member is only offered once the engine has actually returned
    // them a qualified slot in this session; until slots are fetched, show
    // everyone and let the engine hide the unqualified ones per-query.
    return salon.staff;
  }, [salon.staff]);

  const toggleService = useCallback((serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
    );
  }, []);

  const loadSlots = useCallback(async () => {
    if (selectedServiceIds.length === 0) {
      return;
    }
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const res = await fetchAvailability(salon.slug, {
        serviceIds: selectedServiceIds,
        staffId: selectedStaffId,
        date: selectedDate,
      });
      setSlots(res.slots);
    } catch (err) {
      setSlotsError(err instanceof ApiRequestError ? err.message : "Could not load availability.");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [salon.slug, selectedServiceIds, selectedStaffId, selectedDate]);

  useEffect(() => {
    if (step === "slots") {
      void loadSlots();
    }
  }, [step, selectedDate, selectedStaffId, loadSlots]);

  const goTo = useCallback((next: WizardStep) => {
    setError(null);
    setStep(next);
  }, []);

  const selectSlot = useCallback((slot: AvailabilitySlot) => {
    setSlotTakenNotice(false);
    setSelectedSlot(slot);
    setStep("details");
  }, []);

  /** Editing the code after a successful check invalidates that check — the code shown must always match what was actually verified. */
  const setGiftCardCode = useCallback((code: string) => {
    setGiftCardCodeRaw(code);
    setGiftCardPreview(null);
    setGiftCardApplied(false);
    setGiftCardError(null);
  }, []);

  /** A pure read — previews the card's balance before anything is committed. The real deduction happens server-side, at confirm. */
  const checkGiftCard = useCallback(async () => {
    if (!hold || giftCardCode.trim().length === 0) {
      return;
    }
    setGiftCardChecking(true);
    setGiftCardError(null);
    try {
      const preview = await previewGiftCard(hold.paymentIntent.id, giftCardCode.trim());
      setGiftCardPreview(preview);
      setGiftCardApplied(true);
    } catch (err) {
      setGiftCardPreview(null);
      setGiftCardApplied(false);
      setGiftCardError(
        err instanceof ApiRequestError
          ? err.message
          : "Could not check this gift card. Please try again.",
      );
    } finally {
      setGiftCardChecking(false);
    }
  }, [hold, giftCardCode]);

  /** Shared by the payment step's button and the NO_ADVANCE auto-skip below — takes the intent id explicitly rather than reading `hold` state, which wouldn't be updated yet right after `setHold()`. */
  const runConfirm = useCallback(
    async (paymentIntentId: string, giftCardCodeToApply?: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await confirmPayment(paymentIntentId, idempotencyKey, giftCardCodeToApply);
        setConfirmed(res);
        setStep("success");
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Could not confirm this booking. Please start again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [idempotencyKey],
  );

  /** Submits customer details and immediately reserves the slot (10-min hold). */
  const submitDetailsAndReserve = useCallback(
    async (input: CustomerDetailsInput, notesInput: string) => {
      if (!selectedSlot) {
        return;
      }
      setCustomer(input);
      setNotes(notesInput);
      setSubmitting(true);
      setError(null);
      try {
        const res = await createBooking(
          salon.slug,
          {
            serviceIds: selectedServiceIds,
            staffId: selectedSlot.staffId,
            start: selectedSlot.start,
            customer: input,
            notes: notesInput || undefined,
          },
          idempotencyKey,
        );
        setHold(res);
        if (res.paymentIntent.advanceRequiredCents === 0) {
          // UX.md: NO_ADVANCE tenants skip the payment step entirely.
          await runConfirm(res.paymentIntent.id);
        } else {
          setStep("payment");
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "SLOT_UNAVAILABLE") {
          setSlotTakenNotice(true);
          setSelectedSlot(null);
          setStep("slots");
          void loadSlots();
        } else {
          setError(err instanceof ApiRequestError ? err.message : "Could not create the booking.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [salon.slug, selectedServiceIds, selectedSlot, idempotencyKey, loadSlots, runConfirm],
  );

  const confirm = useCallback(async () => {
    if (!hold) {
      return;
    }
    await runConfirm(hold.paymentIntent.id, giftCardApplied ? giftCardCode.trim() : undefined);
  }, [hold, runConfirm, giftCardApplied, giftCardCode]);

  const cancel = useCallback(async () => {
    if (!hold) {
      return;
    }
    try {
      await cancelHold(hold.paymentIntent.id);
    } finally {
      setHold(null);
      setSelectedSlot(null);
      setStep("slots");
      setGiftCardCode("");
      void loadSlots();
    }
  }, [hold, loadSlots, setGiftCardCode]);

  return {
    step,
    goTo,
    selectedServiceIds,
    selectedServices,
    toggleService,
    totalDurationMin,
    totalPriceCents,
    hasOfferOnSelection,
    qualifiedStaff,
    selectedStaffId,
    setSelectedStaffId,
    selectedDate,
    setSelectedDate,
    slots,
    loadingSlots,
    slotsError,
    slotTakenNotice,
    selectedSlot,
    selectSlot,
    customer,
    notes,
    submitDetailsAndReserve,
    hold,
    confirm,
    cancel,
    confirmed,
    submitting,
    error,
    giftCardCode,
    setGiftCardCode,
    giftCardPreview,
    giftCardChecking,
    giftCardError,
    giftCardApplied,
    checkGiftCard,
  };
}

export type BookingWizard = ReturnType<typeof useBookingWizard>;
