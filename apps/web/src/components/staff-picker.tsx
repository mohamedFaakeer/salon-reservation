import type { BookingWizard } from "../hooks/use-booking-wizard";

/**
 * Per-service staff qualification is enforced by the engine when slots are
 * fetched (an unqualified pick simply yields no slots, shown via the empty
 * state on the next step) — there's no separate "which staff can do this"
 * endpoint to pre-grey-out choices here, so every active staff member is
 * offered alongside "Any Available Staff".
 */
export function StaffPicker({ wizard }: { wizard: BookingWizard }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-slate-900">Choose your stylist</h2>
      <ul className="mt-2 flex flex-col gap-2">
        <li>
          <button
            type="button"
            data-testid="staff-option-any"
            onClick={() => wizard.setSelectedStaffId(null)}
            aria-pressed={wizard.selectedStaffId === null}
            className={`min-h-11 w-full rounded-lg border p-3 text-left font-medium transition ${
              wizard.selectedStaffId === null
                ? "border-teal-600 bg-teal-50 text-teal-800"
                : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
            }`}
          >
            Any Available Staff
            <span className="ml-2 text-sm font-normal text-slate-500">— fastest option</span>
          </button>
        </li>
        {wizard.qualifiedStaff.map((staff) => {
          const selected = wizard.selectedStaffId === staff.id;
          return (
            <li key={staff.id}>
              <button
                type="button"
                onClick={() => wizard.setSelectedStaffId(staff.id)}
                aria-pressed={selected}
                className={`min-h-11 w-full rounded-lg border p-3 text-left font-medium transition ${
                  selected
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                }`}
              >
                {staff.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
