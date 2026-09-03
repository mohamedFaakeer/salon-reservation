"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createAppointment,
  createInquiry,
  fetchAvailability,
  fetchServices,
  fetchStaff,
  fetchTenantMe,
  type AppointmentRecord,
  type AvailabilitySlot,
  type CustomerRecord,
  type ServiceItem,
  type StaffMember,
} from "../lib/api-client";
import { formatPriceCents, formatTime, todayLocalDate } from "../lib/format";
import { CustomerSearch } from "./customer-search";
import { DrawerShell } from "./drawer-shell";
import { ServiceCombobox } from "./service-combobox";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";
import { SlotsSkeleton } from "./loading-skeleton";
import { BusyLabel } from "./spinner";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

const SOURCES = ["WALK_IN", "PHONE", "WHATSAPP"] as const;
type Source = (typeof SOURCES)[number];

/**
 * Booking or inquiry.
 *
 * An inquiry is a question, not a reservation — somebody asking what a bridal
 * package costs has not chosen a stylist or a time, and making the receptionist
 * invent both just to write the question down is how questions stop getting
 * written down. So the mode hides staff, date, the slot picker and check-in
 * rather than disabling them: a field you must not fill in is noise.
 */
type Mode = "BOOKING" | "INQUIRY";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingDrawer({
  onClose,
  onCreated,
  defaultCheckInNow = false,
  defaultMode = "BOOKING",
  initialCustomer = null,
  initialServiceIds,
  lockMode = false,
}: {
  onClose: () => void;
  /**
   * Receives the booking that was created, so a caller converting an inquiry
   * can link the two. Callers that only need to refresh may ignore it.
   */
  onCreated: (appointment?: AppointmentRecord) => void;
  /** The "Walk-in" quick action pre-checks this — the customer is already standing there. */
  defaultCheckInNow?: boolean;
  defaultMode?: Mode;
  /** Pre-filled when converting an inquiry — they already told us who they are. */
  initialCustomer?: CustomerRecord | null;
  initialServiceIds?: string[];
  /** Converting is a booking by definition; offering "inquiry" there is a dead end. */
  lockMode?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [slug, setSlug] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [customer, setCustomer] = useState<CustomerRecord | null>(initialCustomer);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialServiceIds ?? []);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocalDate());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotTakenNotice, setSlotTakenNotice] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [source, setSource] = useState<Source>("WALK_IN");
  const [checkInNow, setCheckInNow] = useState(defaultCheckInNow);
  const [notes, setNotes] = useState("");
  const [idempotencyKey] = useState(generateIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    void fetchTenantMe().then((res) => setSlug(res.tenant.slug));
    void fetchServices().then((res) => setServices(res.filter((s) => s.active)));
    void fetchStaff().then((res) => setStaff(res.filter((s) => s.active)));
  }, []);

  useEffect(() => {
    // An inquiry never asks the availability engine anything — there is no
    // slot to look for, and querying would be a wasted round trip per keystroke.
    if (mode === "INQUIRY" || !slug || selectedServiceIds.length === 0) {
      setSlots([]);
      return;
    }
    // Selecting a service and then a staff member in quick succession fires
    // this effect twice; without a staleness guard, a slower first response
    // arriving after a faster second one would silently clobber the correct
    // result — ignore any response that isn't from the most recent request.
    let stale = false;
    setLoadingSlots(true);
    setSlotTakenNotice(false);
    fetchAvailability(slug, { serviceIds: selectedServiceIds, staffId: selectedStaffId, date })
      .then((res) => {
        if (!stale) {
          setSlots(res.slots);
        }
      })
      .catch(() => {
        if (!stale) {
          setSlots([]);
        }
      })
      .finally(() => {
        if (!stale) {
          setLoadingSlots(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [mode, slug, selectedServiceIds, selectedStaffId, date]);

  function toggleService(id: string): void {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
    setSelectedSlot(null);
  }

  const totalPriceCents = services
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.priceCents, 0);

  async function handleLogInquiry(): Promise<void> {
    if (!customer) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createInquiry({
        customerId: customer.id,
        // Optional on purpose: "do you do balayage?" is a real question about
        // a service the salon may not even offer.
        serviceIds: selectedServiceIds,
        source,
        notes: notes.trim() || undefined,
      });
      toast.success(
        "Inquiry logged",
        `${customer.firstName} ${customer.lastName} — nothing is booked yet.`,
      );
      onCreated();
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!customer || !selectedSlot) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const appointment = await createAppointment(
        {
          customerId: customer.id,
          serviceIds: selectedServiceIds,
          staffId: selectedSlot.staffId,
          start: selectedSlot.start,
          source,
          notes: notes.trim() || undefined,
          checkInNow,
        },
        idempotencyKey,
      );
      toast.success(
        "Appointment booked",
        `${customer.firstName} ${customer.lastName} — ${formatTime(selectedSlot.start)}`,
      );
      onCreated(appointment);
    } catch (err) {
      // The slot race is not really an error: the booking failed for a reason
      // the operator can fix in one tap, so it stays inline next to the times
      // and repeats as a warning rather than shouting.
      if (err instanceof ApiRequestError && err.code === "SLOT_UNAVAILABLE") {
        setSlotTakenNotice(true);
        setSelectedSlot(null);
        const copy = errorCopy(err);
        toast.warn(copy.title, copy.detail);
      } else {
        const copy = errorCopy(err);
        setError(copy.title);
        toast.error(copy.title, copy.detail);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isInquiry = mode === "INQUIRY";

  return (
    <DrawerShell title={isInquiry ? "New inquiry" : "New booking"} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {lockMode ? null : (
        <ModeSwitch
          mode={mode}
          onChange={(next) => {
            setMode(next);
            // Dropping the slot matters: switching to an inquiry and back must
            // not leave a time selected that the operator can no longer see.
            setSelectedSlot(null);
            setSlotTakenNotice(false);
            setError(null);
          }}
        />
        )}

        <div data-tour-id={TOUR_ANCHORS.bookingDrawer.customerField}>
          {customer ? (
            <div className="rounded border border-teal-200 bg-teal-50 p-3 text-sm">
              <p className="font-medium text-teal-900">
                {customer.firstName} {customer.lastName}
              </p>
              <p className="text-teal-700">{customer.phone}</p>
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="mt-1 text-xs text-teal-700 underline"
              >
                Change
              </button>
            </div>
          ) : (
            <CustomerSearch onSelect={setCustomer} />
          )}
        </div>

        <div data-tour-id={TOUR_ANCHORS.bookingDrawer.servicesField}>
          <ServiceCombobox
            services={services}
            selectedIds={selectedServiceIds}
            onToggle={toggleService}
          />
          {totalPriceCents > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {isInquiry
                ? /* Named as a quote, not a total: nothing is owed on an
                     inquiry, and prices can move before they book. */
                  `Roughly ${formatPriceCents(totalPriceCents)} at today's prices`
                : `Total: ${formatPriceCents(totalPriceCents)}`}
            </p>
          ) : null}
        </div>

        {isInquiry ? null : (
          <>
        <div data-tour-id={TOUR_ANCHORS.bookingDrawer.staffSelect}>
          <label className="mb-2 block text-sm font-medium text-slate-700">Staff</label>
          <select
            data-testid="drawer-staff-select"
            value={selectedStaffId ?? ""}
            onChange={(e) => {
              setSelectedStaffId(e.target.value || null);
              setSelectedSlot(null);
            }}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Any Available Staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div data-tour-id={TOUR_ANCHORS.bookingDrawer.dateField}>
          <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
          <input
            data-testid="drawer-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedSlot(null);
            }}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div data-tour-id={TOUR_ANCHORS.bookingDrawer.timeSlots}>
          <p className="mb-2 text-sm font-medium text-slate-700">Time</p>
          <div role="status" aria-live="polite">
            {slotTakenNotice ? (
              <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                That slot was just booked by another customer. Pick another time.
              </div>
            ) : null}
          </div>
          {loadingSlots ? (
            <SlotsSkeleton />
          ) : selectedServiceIds.length === 0 ? (
            <p className="text-xs text-slate-500">Select a service to see available times.</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-slate-500">
              No open slots on {date} — try another date or staff.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={`${slot.staffId}-${slot.start}`}
                  type="button"
                  data-testid="drawer-slot-option"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border p-2 text-xs ${
                    selectedSlot?.start === slot.start && selectedSlot.staffId === slot.staffId
                      ? "border-teal-600 bg-teal-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="block font-medium">{formatTime(slot.start)}</span>
                  <span className="block text-slate-500">{slot.staffName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {isInquiry ? "How they asked" : "Source"}
          </label>
          <select
            data-testid="drawer-source"
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isInquiry ? null : (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              data-testid="drawer-check-in-now"
              type="checkbox"
              checked={checkInNow}
              onChange={(e) => setCheckInNow(e.target.checked)}
            />
            Check in immediately
          </label>
        )}

        <div>
          <label
            htmlFor="drawer-notes"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            {isInquiry ? "What they asked" : "Notes (optional)"}
          </label>
          <textarea
            id="drawer-notes"
            data-testid="drawer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={isInquiry ? 4 : 2}
            placeholder={
              isInquiry ? "Wants bridal hair and makeup for a wedding in December…" : undefined
            }
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {isInquiry ? (
            <p className="mt-1 text-xs text-slate-500">
              The question itself. This is what you will read when you call them back.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          data-testid={isInquiry ? "drawer-submit-inquiry" : "drawer-submit"}
          data-tour-id={TOUR_ANCHORS.bookingDrawer.submitButton}
          onClick={() => void (isInquiry ? handleLogInquiry() : handleSubmit())}
          /* An inquiry needs only somebody to call back. Services are optional
             and there is no slot to require. */
          disabled={!customer || (!isInquiry && !selectedSlot) || submitting}
          className="min-h-11 rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <BusyLabel busy={submitting} busyText={isInquiry ? "Saving…" : "Booking…"}>
            {isInquiry ? "Log inquiry" : "Book appointment"}
          </BusyLabel>
        </button>
      </div>
    </DrawerShell>
  );
}

/**
 * Booking or inquiry, as a real radio group.
 *
 * Radios rather than two buttons because this is one mutually exclusive
 * choice, and a screen reader should announce it as such — "Inquiry, radio
 * button, 2 of 2" — instead of two unrelated toggles.
 */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (next: Mode) => void }) {
  const options: Array<{ value: Mode; label: string; hint: string }> = [
    { value: "BOOKING", label: "Booking", hint: "Takes a slot" },
    { value: "INQUIRY", label: "Inquiry", hint: "Just a question" },
  ];

  return (
    <fieldset
      className="grid grid-cols-2 gap-2"
      data-testid="drawer-mode"
      data-tour-id={TOUR_ANCHORS.bookingDrawer.modeSwitch}
    >
      <legend className="mb-2 text-sm font-medium text-slate-700">What is this?</legend>
      {options.map((option) => {
        const selected = mode === option.value;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col gap-0.5 rounded border px-3 py-2 transition-colors ${
              selected
                ? "border-teal-500 bg-teal-50 text-teal-900"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="drawer-mode"
                data-testid={`drawer-mode-${option.value}`}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 shrink-0 accent-teal-600"
              />
              <span className="text-sm font-medium">{option.label}</span>
            </span>
            <span className={`pl-6 text-xs ${selected ? "text-teal-700" : "text-slate-500"}`}>
              {option.hint}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
