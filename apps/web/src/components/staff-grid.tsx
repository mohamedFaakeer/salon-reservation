import type { SalonStaff } from "../lib/api-client";
import { initials, portraitFor } from "../lib/imagery";

/**
 * Who works here.
 *
 * Named faces are the cheapest proof that a salon is real, which is most of
 * what this section is for. Portraits are dyed like every other photograph, and
 * a stylist whose image fails to load falls back to drawn initials rather than
 * a broken frame.
 */
export function StaffGrid({ staff }: { staff: SalonStaff[] }) {
  if (staff.length === 0) {
    return null;
  }
  return (
    <section className="px-5 pt-6">
      <h2 className="display text-[22px] text-[var(--ink)]">
        {staff.length === 1 ? "Your stylist" : "The team"}
      </h2>
      <ul className="mt-3 flex gap-2">
        {staff.slice(0, 4).map((member) => (
          <li key={member.id} className="min-w-0 flex-1 text-center">
            <span className="relative block aspect-[1/1.12] overflow-hidden rounded-[var(--radius-sm)] bg-[var(--dye-mid)]">
              <span
                aria-hidden="true"
                className="display absolute inset-0 flex items-center justify-center text-[18px] text-[var(--bloom)]"
              >
                {initials(member.name)}
              </span>
              <img
                src={portraitFor(member.id)}
                alt={member.name}
                loading="lazy"
                decoding="async"
                className="relative h-full w-full object-cover grayscale contrast-110"
              />
            </span>
            <span className="mt-1.5 block truncate text-[11px] font-semibold text-[var(--ink)]">
              {member.name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
