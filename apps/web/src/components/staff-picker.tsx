import type { BookingWizard } from "../hooks/use-booking-wizard";
import { initials, portraitFor } from "../lib/imagery";

/**
 * Choose a stylist.
 *
 * Per-service qualification is enforced by the engine when slots are fetched —
 * an unqualified pick simply yields no slots and the next step says so. There
 * is no endpoint that answers "who can do this" ahead of time, so every active
 * stylist is offered rather than greyed out on a guess.
 *
 * "Anyone" leads because it is genuinely the fastest route to a booking, and
 * the copy says why instead of leaving it as the unexplained default.
 */
export function StaffPicker({ wizard }: { wizard: BookingWizard }) {
  const anyone = wizard.selectedStaffId === null;

  return (
    <div>
      <h2 className="display text-[28px] text-[var(--ink)]">
        Who cuts
        <span className="block">your hair?</span>
      </h2>

      <ul className="mt-4 flex flex-col gap-2">
        <li>
          <button
            type="button"
            data-testid="staff-option-any"
            onClick={() => wizard.setSelectedStaffId(null)}
            aria-pressed={anyone}
            className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border-[1.5px] p-3.5 text-left transition-colors duration-[var(--t-tap)] ${
              anyone
                ? "border-[var(--indigo)] bg-[var(--indigo)] text-[var(--resist)]"
                : "border-[rgba(18,48,44,0.14)] bg-white/50 text-[var(--ink)] hover:border-[rgba(18,48,44,0.3)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
                anyone ? "bg-[var(--bloom)] text-[var(--indigo)]" : "bg-[rgba(18,48,44,0.08)] text-[var(--ink)]"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <circle cx="5.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="10.8" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2 13c.6-1.7 1.9-2.6 3.5-2.6M13.9 13c-.6-1.7-1.8-2.6-3.4-2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold">Anyone</span>
              <span className={`block text-[11px] ${anyone ? "text-[var(--bloom)]" : "text-[#5E6B60]"}`}>
                More times to choose from
              </span>
            </span>
          </button>
        </li>

        {wizard.qualifiedStaff.map((member) => {
          const picked = wizard.selectedStaffId === member.id;
          return (
            <li key={member.id}>
              <button
                type="button"
                data-testid={`staff-option-${member.id}`}
                onClick={() => wizard.setSelectedStaffId(member.id)}
                aria-pressed={picked}
                className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border-[1.5px] p-3.5 text-left transition-colors duration-[var(--t-tap)] ${
                  picked
                    ? "border-[var(--indigo)] bg-[var(--indigo)] text-[var(--resist)]"
                    : "border-[rgba(18,48,44,0.14)] bg-white/50 text-[var(--ink)] hover:border-[rgba(18,48,44,0.3)]"
                }`}
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--dye-mid)]">
                  <span aria-hidden="true" className="display absolute text-[13px] text-[var(--bloom)]">
                    {initials(member.name)}
                  </span>
                  <img
                    src={portraitFor(member.id)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="relative h-full w-full object-cover grayscale contrast-110"
                  />
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] font-bold">{member.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
