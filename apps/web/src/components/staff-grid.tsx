import type { SalonStaff } from "../lib/api-client";

/**
 * Who works here (UX.md §3.2: "staff grid (headshots/initials + specialties)").
 *
 * There are no headshots in the data model and no specialties on the public
 * profile, so this shows initials and names — the parts that actually exist.
 * Inventing a placeholder photo per stylist would look like a missing image
 * rather than a deliberate design.
 */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function StaffGrid({ staff }: { staff: SalonStaff[] }) {
  if (staff.length === 0) {
    return null;
  }

  return (
    <section className="mt-4">
      <h2 className="text-sm font-semibold text-slate-900">
        {staff.length === 1 ? "Your stylist" : "The team"}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {staff.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800"
            >
              {initials(member.name)}
            </span>
            <span className="text-sm text-slate-800">{member.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
