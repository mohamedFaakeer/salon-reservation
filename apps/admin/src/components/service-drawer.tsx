"use client";

import { useState } from "react";
import {
  createService,
  removeServiceDiscount,
  setServiceDiscount,
  updateService,
  type ServiceItem,
} from "../lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  draftFromDiscount,
  draftIsValid,
  draftValueForApi,
  OfferEditor,
  type OfferDraft,
} from "./offer-editor";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

/**
 * Create/edit a service.
 *
 * The engine speaks cents and minutes; this drawer speaks rupees and minutes,
 * and converts on the way out. Typing 2500 where 250000 was meant would price
 * a haircut at twenty-five rupees, so the conversion belongs here rather than
 * in the operator's head.
 */

const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

function rupeesToCents(input: string): number {
  return Math.round(Number(input) * 100);
}

function centsToRupees(cents: number): string {
  return String(cents / 100);
}

export function ServiceDrawer({
  service,
  onClose,
  onSaved,
}: {
  /** Omit to create. */
  service?: ServiceItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(service);

  const [name, setName] = useState(service?.name ?? "");
  const [category, setCategory] = useState(service?.category ?? "");
  const [durationMin, setDurationMin] = useState(service ? String(service.durationMin) : "");
  const [priceRupees, setPriceRupees] = useState(service ? centsToRupees(service.priceCents) : "");
  const [offer, setOffer] = useState<OfferDraft>(() => draftFromDiscount(service?.discount));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const toast = useToast();

  const durationValid = /^\d+$/.test(durationMin) && Number(durationMin) >= 1;
  const priceValid = RUPEE_PATTERN.test(priceRupees);
  const priceCents = priceValid ? rupeesToCents(priceRupees) : 0;
  const canSubmit =
    name.trim().length > 0 && durationValid && priceValid && draftIsValid(offer, priceCents);

  /**
   * Price and duration are snapshotted onto every appointment at booking time,
   * so changing them never rewrites history — but an owner has no way to know
   * that, and the honest answer to "does this change what my customers owe?"
   * deserves to be stated rather than assumed (UX.md §4.2).
   */
  const pricingChanged =
    editing &&
    service !== undefined &&
    (rupeesToCents(priceRupees) !== service.priceCents ||
      Number(durationMin) !== service.durationMin);

  async function save(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || undefined,
        durationMin: Number(durationMin),
        priceCents: rupeesToCents(priceRupees),
      };
      // The service is written first because the offer hangs off it: a new
      // service has no id to attach one to until it exists.
      const saved = service
        ? await updateService(service.id, payload)
        : await createService(payload);

      await syncOffer(saved.id);

      toast.success(
        service ? `${payload.name} updated` : `${payload.name} added`,
        service ? "Existing bookings keep the price they were booked at." : undefined,
      );
      onSaved();
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
      setPendingConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * The offer is a separate resource, so saving one means a second request.
   *
   * Removing is only attempted when there was something to remove — asking
   * the server to delete an offer that never existed answers 404, which is
   * correct of it and useless here.
   */
  async function syncOffer(serviceId: string): Promise<void> {
    if (offer.mode === "NONE") {
      if (service?.discount) {
        await removeServiceDiscount(serviceId);
      }
      return;
    }
    await setServiceDiscount(serviceId, {
      type: offer.mode === "PERCENT" ? "PERCENT" : "FIXED",
      value: draftValueForApi(offer),
      startDate: offer.startDate,
      endDate: offer.endDate,
      label: offer.label.trim() || undefined,
      windows: offer.allDay ? [] : offer.windows,
    });
  }

  function handleSubmit(): void {
    if (!canSubmit) {
      return;
    }
    if (pricingChanged) {
      setPendingConfirm(true);
      return;
    }
    void save();
  }

  return (
    <>
      <DrawerShell title={editing ? "Edit service" : "New service"} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm" data-tour-id={TOUR_ANCHORS.serviceDrawer.nameField}>
            <span className="font-medium text-slate-700">Name</span>
            <input
              data-testid="service-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Category <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              data-testid="service-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Hair, Makeup, Grooming…"
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3" data-tour-id={TOUR_ANCHORS.serviceDrawer.durationPriceFields}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Duration (minutes)</span>
              <input
                data-testid="service-duration"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                inputMode="numeric"
                aria-invalid={durationMin.length > 0 && !durationValid}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
              <span className="text-xs text-slate-500">Include wash and cleanup</span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Price (Rs.)</span>
              <input
                data-testid="service-price"
                value={priceRupees}
                onChange={(e) => setPriceRupees(e.target.value)}
                inputMode="decimal"
                aria-invalid={priceRupees.length > 0 && !priceValid}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
              <span className="text-xs text-slate-500">In rupees, not cents</span>
            </label>
          </div>

          <OfferEditor draft={offer} onChange={setOffer} priceCents={priceCents} />

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              data-testid="service-save"
              data-tour-id={TOUR_ANCHORS.serviceDrawer.saveButton}
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <BusyLabel busy={submitting} busyText="Saving…">
                {editing ? "Save changes" : "Create service"}
              </BusyLabel>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </DrawerShell>

      {pendingConfirm && service ? (
        <ConfirmDialog
          title={`Change pricing for ${service.name}?`}
          body={
            <>
              <p className="tabular">
                {service.priceCents !== rupeesToCents(priceRupees) ? (
                  <>
                    Rs. {(service.priceCents / 100).toLocaleString("en-LK")} →{" "}
                    <strong className="text-slate-900">
                      Rs. {Number(priceRupees).toLocaleString("en-LK")}
                    </strong>
                    <br />
                  </>
                ) : null}
                {service.durationMin !== Number(durationMin) ? (
                  <>
                    {service.durationMin} min →{" "}
                    <strong className="text-slate-900">{durationMin} min</strong>
                  </>
                ) : null}
              </p>
              {/* Text is tinted from the surface's own hue rather than neutral
                  slate — grey on a coloured ground reads as washed out. */}
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-800">
                  What this affects
                </p>
                <p className="mt-1">
                  Existing bookings keep the price and duration they were booked at. Only new
                  bookings use the new values.
                </p>
              </div>
            </>
          }
          confirmLabel="Change pricing"
          cancelLabel="Keep current"
          busy={submitting}
          onConfirm={() => void save()}
          onCancel={() => setPendingConfirm(false)}
        />
      ) : null}
    </>
  );
}
