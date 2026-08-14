"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createAppointment,
  fetchAvailability,
  fetchServices,
  fetchStaff,
  fetchTenantMe,
  type AvailabilitySlot,
  type CustomerRecord,
  type ServiceItem,
  type StaffMember,
} from "../lib/api-client";
import { formatDurationMin, formatPriceCents, formatTime, todayLocalDate } from "../lib/format";
import { CustomerSearch } from "./customer-search";
import { LoadingSkeleton } from "./loading-skeleton";

const SOURCES = ["WALK_IN", "PHONE", "WHATSAPP"] as const;
type Source = (typeof SOURCES)[number];

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocalDate());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotTakenNotice, setSlotTakenNotice] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [source, setSource] = useState<Source>("WALK_IN");
  const [checkInNow, setCheckInNow] = useState(false);
  const [notes, setNotes] = useState("");
  const [idempotencyKey] = useState(generateIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTenantMe().then((res) => setSlug(res.tenant.slug));
    void fetchServices().then((res) => setServices(res.filter((s) => s.active)));
    void fetchStaff().then((res) => setStaff(res.filter((s) => s.active)));
  }, []);

  useEffect(() => {
    if (!slug || selectedServiceIds.length === 0) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlotTakenNotice(false);
    fetchAvailability(slug, { serviceIds: selectedServiceIds, staffId: selectedStaffId, date })
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [slug, selectedServiceIds, selectedStaffId, date]);

  function toggleService(id: string): void {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setSelectedSlot(null);
  }

  const totalPriceCents = services
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.priceCents, 0);

  async function handleSubmit(): Promise<void> {
    if (!customer || !selectedSlot) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createAppointment(
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
      onCreated();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SLOT_UNAVAILABLE") {
        setSlotTakenNotice(true);
        setSelectedSlot(null);
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Could not create the booking.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New booking</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5">
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

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Services</p>
            <ul className="flex flex-col gap-1">
              {services.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      data-testid={`drawer-service-${service.id}`}
                      onClick={() => toggleService(service.id)}
                      className={`flex w-full items-center justify-between rounded border p-2 text-left text-sm ${
                        selected ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span>
                        {service.name}{" "}
                        <span className="text-slate-400">({formatDurationMin(service.durationMin)})</span>
                      </span>
                      <span className="font-medium">{formatPriceCents(service.priceCents)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {totalPriceCents > 0 ? (
              <p className="mt-1 text-xs text-slate-500">Total: {formatPriceCents(totalPriceCents)}</p>
            ) : null}
          </div>

          <div>
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

          <div>
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

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Time</p>
            {slotTakenNotice ? (
              <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                That slot was just booked by another customer. Pick another time.
              </div>
            ) : null}
            {loadingSlots ? (
              <LoadingSkeleton rows={2} />
            ) : selectedServiceIds.length === 0 ? (
              <p className="text-xs text-slate-400">Select a service to see available times.</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-slate-400">No open slots on {date} — try another date or staff.</p>
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

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Source</label>
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

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              data-testid="drawer-check-in-now"
              type="checkbox"
              checked={checkInNow}
              onChange={(e) => setCheckInNow(e.target.checked)}
            />
            Check in immediately
          </label>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            data-testid="drawer-submit"
            onClick={() => void handleSubmit()}
            disabled={!customer || !selectedSlot || submitting}
            className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Booking…" : "Book appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}
