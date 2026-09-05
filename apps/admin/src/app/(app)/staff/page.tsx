"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchServices,
  fetchStaff,
  fetchStaffServiceAssignments,
  updateStaff,
  type ServiceItem,
  type StaffMember,
} from "../../../lib/api-client";
import { canManageStaff } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row, RowActions } from "../../../components/data-table";
import { StaffDrawer } from "../../../components/staff-drawer";
import { SkillsMatrix } from "../../../components/skills-matrix";
import { BusyLabel } from "../../../components/spinner";
import { TOUR_ANCHORS } from "../../../lib/tour-anchors";

type Tab = "team" | "matrix";

export default function StaffPage() {
  const { user } = useAuth();
  const canManage = canManageStaff(user?.roles ?? []);

  const [tab, setTab] = useState<Tab>("team");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStaff(), fetchServices(), fetchStaffServiceAssignments()])
      .then(([staffRows, serviceRows, assignmentRows]) => {
        setStaff(staffRows);
        setServices(serviceRows.filter((s) => s.active));
        // Three requests, whatever the size of the team. This used to ask once
        // per stylist, on the reasoning that a salon has tens of staff at
        // most — true, and still enough to make opening this screen cost
        // forty requests.
        setAssignments(
          Object.fromEntries(assignmentRows.map((a) => [a.staffId, a.serviceIds])),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load the team.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function toggleActive(member: StaffMember): Promise<void> {
    setTogglingId(member.id);
    setError(null);
    try {
      await updateStaff(member.id, { active: !member.active });
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not change this stylist.");
    } finally {
      setTogglingId(null);
    }
  }

  const skillCount = (id: string): number => (assignments[id] ?? []).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff &amp; skills</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Who works here, and what each of them can do.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            data-testid="add-staff-button"
            data-tour-id={TOUR_ANCHORS.staff.addStaffButton}
            onClick={() => setCreating(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Add stylist
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["team", "Team"],
            ["matrix", "Skills matrix"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`tab-${key}`}
            data-tour-id={key === "team" ? TOUR_ANCHORS.staff.teamTab : TOUR_ANCHORS.staff.matrixTab}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`min-h-11 border-b-2 px-4 text-sm ${
              tab === key
                ? "border-teal-600 font-semibold text-teal-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No stylists yet — add the first person who works here."
          action={canManage ? { label: "Add stylist", onClick: () => setCreating(true) } : undefined}
        />
      ) : tab === "team" ? (
        <DataTable
          caption="Stylists at this salon"
          columns={[
            { label: "Stylist" },
            { label: "Phone" },
            { label: "Can perform" },
            { label: "Status" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {staff.map((member) => {
            const skills = skillCount(member.id);
            // An active stylist with no skills looks fine and cannot take a
            // single booking — the contradiction has to be visible on the row.
            const blocked = member.active && skills === 0;
            return (
              <Row key={member.id} muted={!member.active} testId={`staff-row-${member.id}`}>
                <Cell className={blocked ? "bg-amber-50" : ""}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: member.color ?? "#475569" }}
                    />
                    <span className={member.active ? "font-medium text-slate-900" : "text-slate-500"}>
                      {member.name}
                    </span>
                  </span>
                  {blocked ? (
                    <span
                      data-testid={`staff-blocked-${member.id}`}
                      className="mt-1 block text-xs font-medium text-amber-800"
                    >
                      Can&apos;t be booked — no services assigned
                    </span>
                  ) : null}
                </Cell>
                <Cell className={blocked ? "bg-amber-50" : ""}>
                  {member.phone ?? <span className="text-slate-400">—</span>}
                </Cell>
                <Cell className={blocked ? "bg-amber-50" : ""}>
                  {skills === 0 ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      None
                    </span>
                  ) : (
                    <span className="tabular">
                      {skills} service{skills === 1 ? "" : "s"}
                    </span>
                  )}
                </Cell>
                <Cell className={blocked ? "bg-amber-50" : ""}>
                  {member.active ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
                      Inactive
                    </span>
                  )}
                </Cell>
                {canManage ? (
                  <RowActions>
                    <button
                      type="button"
                      data-testid={`edit-staff-${member.id}`}
                      onClick={() => setEditing(member)}
                      className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      data-testid={`skills-staff-${member.id}`}
                      data-tour-id={TOUR_ANCHORS.staff.skillsShortcutButton}
                      onClick={() => setTab("matrix")}
                      className={
                        blocked
                          ? "min-h-11 rounded bg-teal-600 px-2.5 text-xs font-medium text-white hover:bg-teal-700"
                          : "min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                      }
                    >
                      {blocked ? "Assign skills" : "Skills"}
                    </button>
                    <button
                      type="button"
                      data-testid={`toggle-staff-${member.id}`}
                      data-tour-id={TOUR_ANCHORS.staff.toggleStaffButton}
                      onClick={() => void toggleActive(member)}
                      disabled={togglingId === member.id}
                      className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                    >
                      <BusyLabel busy={togglingId === member.id} busyText="Saving…">
                        {member.active ? "Deactivate" : "Restore"}
                      </BusyLabel>
                    </button>
                  </RowActions>
                ) : (
                  <Cell />
                )}
              </Row>
            );
          })}
        </DataTable>
      ) : (
        <SkillsMatrix
          key={JSON.stringify(assignments)}
          staff={staff}
          services={services}
          assignments={assignments}
          onSaved={load}
        />
      )}

      {creating ? (
        <StaffDrawer
          onClose={() => setCreating(false)}
          onSaved={(_id, wasCreated) => {
            setCreating(false);
            load();
            // "Add and choose skills" promises the next step — deliver it.
            if (wasCreated) {
              setTab("matrix");
            }
          }}
        />
      ) : null}
      {editing ? (
        <StaffDrawer
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
