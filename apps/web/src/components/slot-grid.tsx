import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatTime } from "../lib/format";
import { EmptyState } from "./empty-state";
import { LoadingSkeleton } from "./loading-skeleton";

export function SlotGrid({ wizard }: { wizard: BookingWizard }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-slate-900">Choose a time</h2>

      {/* This appears asynchronously when someone else wins the slot race, so
          it needs a live region — otherwise the only signal that the booking
          just changed underneath the customer is a purely visual one. */}
      <div role="status" aria-live="polite">
        {wizard.slotTakenNotice ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            That slot was just booked by another customer. Pick another time.
          </div>
        ) : null}
      </div>

      {wizard.loadingSlots ? (
        <LoadingSkeleton rows={4} />
      ) : wizard.slotsError ? (
        <EmptyState
          title={wizard.slotsError}
          action={{ label: "Retry", onClick: () => wizard.setSelectedDate(wizard.selectedDate) }}
        />
      ) : wizard.slots.length === 0 ? (
        <EmptyState
          title={`No open slots on ${wizard.selectedDate} — try another date or staff.`}
        />
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {wizard.slots.map((slot, i) => (
            <li key={`${slot.staffId}-${slot.start}`}>
              <button
                type="button"
                data-testid="slot-option"
                onClick={() => wizard.selectSlot(slot)}
                className={`flex min-h-11 w-full flex-col items-center justify-center rounded-lg border p-2 text-sm transition ${
                  i === 0
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                }`}
              >
                <span className="font-semibold">{formatTime(slot.start)}</span>
                <span className="text-xs text-slate-500">{slot.staffName}</span>
                {i === 0 ? (
                  <span className="mt-1 text-xs font-medium text-teal-700">Fastest available</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
