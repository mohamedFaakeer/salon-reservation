import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatTime } from "../lib/format";
import { DyeButton, Marker } from "./cloth";
import { EmptyState } from "./empty-state";
import { SlotsSkeleton } from "./loading-skeleton";

/**
 * Pick a time. The screen that has to feel instant.
 *
 * The earliest slot is lifted out of the grid into its own lit panel, because
 * "soonest" is what most people are actually choosing and making them find it
 * in a grid is work the screen can do for them. That panel is the one lit
 * element on this screen — the glow *is* the state, which is what makes it
 * readable at arm's length in sunlight.
 *
 * Every slot rendered here came from the engine and can genuinely be booked.
 * There is no greyed-out grid of taken times; an empty day says so plainly.
 */
export function SlotGrid({ wizard }: { wizard: BookingWizard }) {
  const [fastest, ...rest] = wizard.slots;

  return (
    <div>
      <h2 className="display text-[28px] text-[var(--ink)]">
        When suits
        <span className="block">you?</span>
      </h2>

      {/* Someone else can win the slot race while this screen is open, so the
          notice has to be announced, not just drawn. */}
      <div role="status" aria-live="polite">
        {wizard.slotTakenNotice ? (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--alarm)] bg-[rgba(224,163,60,0.12)] p-3 text-[13px] font-medium text-[#7A4E12]">
            Someone took that time while you were deciding. Pick another.
          </p>
        ) : null}
      </div>

      {wizard.loadingSlots ? (
        <div className="mt-4">
          <SlotsSkeleton />
        </div>
      ) : wizard.slotsError ? (
        <div className="mt-4">
          <EmptyState
            title={wizard.slotsError}
            action={{ label: "Try again", onClick: () => wizard.setSelectedDate(wizard.selectedDate) }}
          />
        </div>
      ) : wizard.slots.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius)] border border-dashed border-[rgba(18,48,44,0.22)] px-6 py-9 text-center">
          <p className="text-[14px] font-bold text-[var(--ink)]">Nothing free this day.</p>
          <p className="mt-1 text-[12.5px] text-[#5E6B60]">
            Try another day, or pick Anyone to see more times.
          </p>
        </div>
      ) : (
        <>
          {/* The lit panel. Exactly one per screen. */}
          <div className="relative mt-4 flex items-center gap-4 overflow-hidden rounded-[var(--radius)] bg-[linear-gradient(120deg,var(--dye),var(--dye-press))] p-4 shadow-[0_18px_38px_-20px_var(--dye)]">
            <div className="min-w-0 flex-1">
              <Marker>Soonest</Marker>
              <p className="display display-wide tabular mt-0.5 text-[30px] leading-none text-[#022B27]">
                {formatTime(fastest.start)}
              </p>
              <p className="mt-1 truncate text-[11.5px] font-semibold text-[#04413B]">
                {fastest.staffName}
              </p>
            </div>
            <DyeButton
              tone="onDye"
              testId="slot-option"
              onClick={() => wizard.selectSlot(fastest)}
              className="shrink-0"
            >
              Take it
            </DyeButton>
          </div>

          {rest.length > 0 ? (
            <>
              <p className="mt-6">
                <Marker on="cloth">Other times</Marker>
              </p>
              <ul className="mt-2.5 grid grid-cols-3 gap-2">
                {rest.map((slot, i) => (
                  <li
                    key={`${slot.staffId}-${slot.start}`}
                    className="anim-rise"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <button
                      type="button"
                      data-testid="slot-option"
                      onClick={() => wizard.selectSlot(slot)}
                      className="flex min-h-12 w-full cursor-pointer flex-col items-center justify-center rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(18,48,44,0.14)] px-1 py-3 transition-colors duration-[var(--t-tap)] hover:border-[var(--indigo)] active:bg-[var(--indigo)] active:text-[var(--resist)]"
                    >
                      <span className="display tabular text-[15px] text-[var(--ink)]">
                        {formatTime(slot.start)}
                      </span>
                      <span className="mt-0.5 max-w-full truncate text-[9.5px] text-[#5E6B60]">
                        {slot.staffName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
