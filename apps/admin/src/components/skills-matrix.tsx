"use client";

import { useState } from "react";
import {
  ApiRequestError,
  setStaffServices,
  type ServiceItem,
  type StaffMember,
} from "../lib/api-client";
import { BusyLabel } from "./spinner";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

/**
 * Staff × services coverage grid.
 *
 * Qualification fails in two directions and both are silent: a stylist linked
 * to no service is never offered, and a service no active stylist is linked to
 * can never be booked at all. A per-stylist checklist can only show the first
 * — you would have to open every stylist and remember what you saw to notice
 * the second. The grid shows both, with a per-service tally along the bottom.
 *
 * Saving is per row because the API replaces a stylist's entire assignment set
 * in one PUT, so the row is the natural unit of change.
 */
export function SkillsMatrix({
  staff,
  services,
  assignments,
  onSaved,
}: {
  staff: StaffMember[];
  services: ServiceItem[];
  /** staffId -> assigned serviceIds, as loaded from the server. */
  assignments: Record<string, string[]>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string[]>>(assignments);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(staffId: string, serviceId: string): void {
    setDraft((prev) => {
      const current = prev[staffId] ?? [];
      return {
        ...prev,
        [staffId]: current.includes(serviceId)
          ? current.filter((id) => id !== serviceId)
          : [...current, serviceId],
      };
    });
  }

  function isDirty(staffId: string): boolean {
    const a = [...(assignments[staffId] ?? [])].sort();
    const b = [...(draft[staffId] ?? [])].sort();
    return a.length !== b.length || a.some((id, i) => id !== b[i]);
  }

  async function saveRow(staffId: string): Promise<void> {
    setSavingId(staffId);
    setError(null);
    try {
      await setStaffServices(staffId, draft[staffId] ?? []);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save these skills.");
    } finally {
      setSavingId(null);
    }
  }

  /** Only active staff count toward coverage — a retired stylist cannot be booked. */
  const coverage = (serviceId: string): number =>
    staff.filter((s) => s.active && (draft[s.id] ?? []).includes(serviceId)).length;

  const uncovered = services.filter((s) => coverage(s.id) === 0);

  if (staff.length === 0 || services.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add at least one stylist and one service before assigning skills.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {/* A staff × service grid gets wide fast with a real catalog — rotated
          headers and thumbnail-sized checkboxes are workable with a mouse but
          not on a phone. Below `lg` the same draft/save state drives a plain
          vertical list instead: one disclosure per stylist. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {staff.map((member) => {
          const assigned = draft[member.id] ?? [];
          const dirty = isDirty(member.id);
          return (
            <details
              key={member.id}
              data-testid={`mobile-matrix-row-${member.id}`}
              className={`rounded-lg border border-slate-200 bg-white ${
                assigned.length === 0 ? "bg-amber-50/60" : ""
              }`}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: member.color ?? "#475569" }}
                />
                <span className={`flex-1 font-medium ${member.active ? "text-slate-900" : "text-slate-500"}`}>
                  {member.name}
                </span>
                <span className="text-xs text-slate-400">
                  {assigned.length} service{assigned.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="flex flex-col gap-0.5 border-t border-slate-100 px-3.5 py-2">
                {services.map((service) => {
                  const on = assigned.includes(service.id);
                  return (
                    <label
                      key={service.id}
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm text-slate-700"
                    >
                      <span className="flex items-center gap-1.5">
                        {service.name}
                        {coverage(service.id) === 0 ? (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                            uncovered
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(member.id, service.id)}
                        data-testid={`mobile-skill-${member.id}-${service.id}`}
                        className="h-4 w-4 shrink-0 accent-teal-600"
                      />
                    </label>
                  );
                })}
                <button
                  type="button"
                  data-testid={`mobile-save-skills-${member.id}`}
                  onClick={() => void saveRow(member.id)}
                  disabled={!dirty || savingId === member.id}
                  className="mt-1 min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <BusyLabel busy={savingId === member.id} busyText="Saving…">
                    Save
                  </BusyLabel>
                </button>
              </div>
            </details>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Which services each stylist is qualified to perform
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th scope="col" className="min-w-40 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
                Stylist
              </th>
              {services.map((service) => (
                <th
                  key={service.id}
                  scope="col"
                  className={`h-28 border-l border-slate-100 px-1 align-bottom ${
                    coverage(service.id) === 0 ? "bg-amber-50" : ""
                  }`}
                >
                  {/* Vertical labels keep a 10-15 service salon on one screen. */}
                  <span
                    className="inline-block whitespace-nowrap text-xs font-semibold text-slate-700"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    {service.name}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
                Save
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const assigned = draft[member.id] ?? [];
              const dirty = isDirty(member.id);
              return (
                <tr
                  key={member.id}
                  data-testid={`matrix-row-${member.id}`}
                  data-tour-id={TOUR_ANCHORS.skillsMatrix.row}
                  className={`border-b border-slate-100 last:border-b-0 ${
                    assigned.length === 0 ? "bg-amber-50/60" : ""
                  }`}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: member.color ?? "#475569" }}
                      />
                      <span className={member.active ? "" : "text-slate-500"}>{member.name}</span>
                    </span>
                  </th>
                  {services.map((service) => {
                    const on = assigned.includes(service.id);
                    return (
                      <td
                        key={service.id}
                        className={`border-l border-slate-100 text-center ${
                          coverage(service.id) === 0 ? "bg-amber-50" : ""
                        }`}
                      >
                        <label className="flex min-h-11 cursor-pointer items-center justify-center">
                          <span className="sr-only">
                            {member.name} performs {service.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(member.id, service.id)}
                            data-testid={`skill-${member.id}-${service.id}`}
                            className="h-4 w-4 accent-teal-600"
                          />
                        </label>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      data-testid={`save-skills-${member.id}`}
                      data-tour-id={TOUR_ANCHORS.skillsMatrix.saveButton}
                      onClick={() => void saveRow(member.id)}
                      disabled={!dirty || savingId === member.id}
                      className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <BusyLabel busy={savingId === member.id} busyText="Saving…">
                        Save
                      </BusyLabel>
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
              <th scope="row" className="px-3 py-2 text-left font-medium">
                Qualified staff
              </th>
              {services.map((service) => {
                const n = coverage(service.id);
                return (
                  <td
                    key={service.id}
                    className={`border-l border-slate-100 py-2 text-center tabular ${
                      n === 0 ? "bg-amber-50 font-bold text-amber-800" : ""
                    }`}
                  >
                    {n}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {uncovered.length > 0 ? (
        <div
          data-testid="uncovered-warning"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <strong className="font-semibold">
            {uncovered.length === 1
              ? `${uncovered[0].name} cannot be booked.`
              : `${uncovered.length} services cannot be booked.`}
          </strong>{" "}
          {uncovered.length === 1
            ? "No active stylist is qualified for it, so it never appears as an option to customers."
            : `No active stylist is qualified for ${uncovered.map((s) => s.name).join(", ")}, so they never appear as options to customers.`}{" "}
          Assign {uncovered.length === 1 ? "it" : "them"} to someone, or retire the service.
        </div>
      ) : null}
    </div>
  );
}
