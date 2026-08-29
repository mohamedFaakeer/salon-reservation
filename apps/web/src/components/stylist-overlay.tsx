"use client";

import type { SalonStaff } from "../lib/api-client";
import { initials, portraitFor } from "../lib/imagery";

const GENDER_LABEL: Record<string, string> = { MALE: "Male", FEMALE: "Female" };

/**
 * A stylist's small public overview — same overlay chrome as `AccountOverlay`
 * (dimmed backdrop, bottom sheet on mobile / centered card on larger
 * screens, the dyed ground) so a second modal idiom never enters the world.
 */
export function StylistOverlay({ staff, onClose }: { staff: SalonStaff; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(4,33,31,0.6)] sm:items-center sm:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={staff.name}
        className="anim-rise relative w-full max-w-sm rounded-t-[26px] bg-[var(--dye-mid)] p-6 pb-[calc(env(safe-area-inset-bottom)+22px)] sm:rounded-[26px]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(240,231,214,0.1)] text-[var(--resist)]"
        >
          ✕
        </button>

        <span className="relative mx-auto block aspect-[1/1.12] w-32 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--dye-mid)]">
          <span
            aria-hidden="true"
            className="display absolute inset-0 flex items-center justify-center text-[26px] text-[var(--bloom)]"
          >
            {initials(staff.name)}
          </span>
          <img
            src={staff.imageUrl ?? portraitFor(staff.id)}
            alt=""
            className="relative h-full w-full object-cover grayscale contrast-110"
          />
        </span>

        <div className="mt-4 text-center">
          <h2 className="display text-[24px] text-[var(--resist)]">{staff.name}</h2>
          {staff.jobTitle ? <p className="mt-0.5 text-[13px] text-[var(--bloom)]">{staff.jobTitle}</p> : null}
          {staff.gender && GENDER_LABEL[staff.gender] ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[rgba(240,231,214,0.55)]">
              {GENDER_LABEL[staff.gender]}
            </p>
          ) : null}
        </div>

        {staff.specialties ? (
          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-[rgba(240,231,214,0.85)]">
            {staff.specialties}
          </p>
        ) : null}
      </div>
    </div>
  );
}
