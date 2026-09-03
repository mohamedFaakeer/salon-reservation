"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchTeam,
  resetTeamMemberPassword,
  updateTeamMember,
  type AssignableRole,
  type TeamMember,
} from "../../../lib/api-client";
import { canManageTeam, canResetTeamMemberPassword } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { errorCopy } from "../../../lib/error-copy";
import { Cell, DataTable, Row, RowActions } from "../../../components/data-table";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { RoleAccess, TeamDrawer } from "../../../components/team-drawer";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { BusyLabel } from "../../../components/spinner";
import { useToast } from "../../../components/toast";
import { formatDate } from "../../../lib/format";
import { TOUR_ANCHORS } from "../../../lib/tour-anchors";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  RECEPTIONIST: "Receptionist",
  STAFF: "Stylist",
};

/** Shown once, right after creating a login or resetting a password — the server keeps only a hash. */
interface NewLogin {
  name: string;
  email: string;
  password: string;
  reason: "created" | "reset";
}

export default function TeamPage() {
  const { user } = useAuth();
  const canManage = canManageTeam(user?.roles ?? []);
  // OWNER always has this too (server-side RESET_TEAM_MEMBER_PASSWORD is
  // granted to both) — MANAGER's one capability on this page besides
  // reading the list (account-lockout-v2, DECISIONS.md).
  const canReset = canResetTeamMemberPassword(user?.roles ?? []);
  const toast = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLogin, setNewLogin] = useState<NewLogin | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTeam()
      .then(setMembers)
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load the team.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function setStatus(member: TeamMember, status: "ACTIVE" | "DISABLED"): Promise<void> {
    setBusyId(member.userId);
    try {
      await updateTeamMember(member.userId, { status });
      toast.success(
        status === "ACTIVE"
          ? `${member.name} can sign in again`
          : `${member.name} can no longer sign in`,
      );
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  async function setRole(member: TeamMember, role: AssignableRole): Promise<void> {
    setBusyId(member.userId);
    try {
      await updateTeamMember(member.userId, { role });
      toast.success(`${member.name} is now a ${ROLE_LABELS[role].toLowerCase()}`);
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(): Promise<void> {
    if (!resetTarget) {
      return;
    }
    setResetting(true);
    try {
      const result = await resetTeamMemberPassword(resetTarget.userId);
      setNewLogin({
        name: resetTarget.name,
        email: resetTarget.email,
        password: result.temporaryPassword,
        reason: "reset",
      });
      toast.success(`${resetTarget.name}'s password was reset`);
      setResetTarget(null);
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setResetting(false);
    }
  }

  if (!canManage && !canReset) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Only the salon owner or a manager can view or change logins.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        {canManage ? (
          <button
            type="button"
            data-testid="new-team-button"
            data-tour-id={TOUR_ANCHORS.team.newTeamButton}
            onClick={() => setCreating(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            New login
          </button>
        ) : null}
      </div>

      {newLogin ? (
        <div
          data-testid="new-login-credentials"
          data-tour-id={TOUR_ANCHORS.team.newLoginCredentials}
          role="status"
          className="rounded-lg border border-teal-300 bg-teal-50 p-4"
        >
          <p className="text-sm font-semibold text-teal-900">
            {newLogin.reason === "created" ? `${newLogin.name} can now sign in.` : `${newLogin.name}'s password was reset.`}
          </p>
          <p className="mt-1 text-xs text-teal-800">
            Give these to them now. The password is not stored and cannot be shown again.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal-700">
                Email
              </dt>
              <dd className="text-sm text-teal-950">{newLogin.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal-700">
                Password
              </dt>
              <dd className="text-sm text-teal-950 tabular">{newLogin.password}</dd>
            </div>
          </dl>
          <button
            type="button"
            data-testid="dismiss-new-login"
            onClick={() => setNewLogin(null)}
            className="mt-3 min-h-11 rounded border border-teal-600 px-3 text-xs font-medium text-teal-800 hover:bg-teal-100"
          >
            Saved them
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <DataTable
          caption="People who can sign in to this salon"
          columns={[
            { label: "Name" },
            { label: "Role" },
            { label: "Status" },
            { label: "Last signed in", align: "right" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {members.map((member) => {
            const isOwner = member.role === "OWNER";
            const isSelf = member.userId === user?.id;
            // The owner cannot be changed here, and nobody can lock
            // themselves out — there is no self-service way back in.
            const protectedRow = isOwner || isSelf;
            return (
              <Row
                key={member.userId}
                muted={member.status === "DISABLED"}
                testId={`team-row-${member.userId}`}
              >
                <Cell>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === member.userId ? null : member.userId)}
                    aria-expanded={expanded === member.userId}
                    className="text-left"
                  >
                    <span className="block font-medium text-slate-900">{member.name}</span>
                    <span className="block text-xs text-slate-500">{member.email}</span>
                  </button>
                  {expanded === member.userId ? (
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                      <RoleAccess role={member.role} />
                    </div>
                  ) : null}
                </Cell>
                <Cell>
                  {/* Role changes stay OWNER-only, even for a MANAGER who can
                      also reach this page now — RESET_TEAM_MEMBER_PASSWORD
                      never implies MANAGE_TEAM (DECISIONS.md). */}
                  {canManage && !protectedRow ? (
                    <select
                      data-testid={`team-role-select-${member.userId}`}
                      data-tour-id={TOUR_ANCHORS.team.roleSelect}
                      value={member.role}
                      onChange={(e) => void setRole(member, e.target.value as AssignableRole)}
                      disabled={busyId === member.userId}
                      aria-label={`Role for ${member.name}`}
                      className="min-h-11 rounded border border-slate-300 px-2 text-sm"
                    >
                      <option value="MANAGER">Manager</option>
                      <option value="RECEPTIONIST">Receptionist</option>
                      <option value="STAFF">Stylist</option>
                    </select>
                  ) : (
                    <span className="text-sm text-slate-700">{ROLE_LABELS[member.role]}</span>
                  )}
                </Cell>
                <Cell>
                  {member.status === "LOCKED" ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      Locked
                    </span>
                  ) : member.status === "ACTIVE" ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
                      No access
                    </span>
                  )}
                </Cell>
                <Cell align="right">
                  {member.lastLoginAt ? (
                    <span className="text-slate-600 tabular">{formatDate(member.lastLoginAt)}</span>
                  ) : (
                    <span className="text-xs text-slate-400">Never</span>
                  )}
                </Cell>
                {protectedRow ? (
                  <Cell>
                    <span className="text-xs text-slate-400">{isSelf ? "You" : "Owner"}</span>
                  </Cell>
                ) : (
                  <RowActions>
                    {canReset ? (
                      <button
                        type="button"
                        data-testid={`team-reset-password-${member.userId}`}
                        data-tour-id={TOUR_ANCHORS.team.resetPasswordButton}
                        onClick={() => setResetTarget(member)}
                        className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Reset password
                      </button>
                    ) : null}
                    {/* Omitted entirely for a LOCKED row — the server refuses
                        to clear a lockout this way, and "Reset password"
                        above is the only real way back in for that state. */}
                    {canManage && member.status !== "LOCKED" ? (
                      <button
                        type="button"
                        data-testid={`team-toggle-${member.userId}`}
                        onClick={() =>
                          void setStatus(member, member.status === "ACTIVE" ? "DISABLED" : "ACTIVE")
                        }
                        disabled={busyId === member.userId}
                        className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                      >
                        <BusyLabel busy={busyId === member.userId} busyText="Saving…">
                          {member.status === "ACTIVE" ? "Remove access" : "Restore access"}
                        </BusyLabel>
                      </button>
                    ) : null}
                    {canManage && member.status === "LOCKED" ? (
                      <button
                        type="button"
                        data-testid={`team-disable-locked-${member.userId}`}
                        onClick={() => void setStatus(member, "DISABLED")}
                        disabled={busyId === member.userId}
                        className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                      >
                        <BusyLabel busy={busyId === member.userId} busyText="Saving…">
                          Remove access
                        </BusyLabel>
                      </button>
                    ) : null}
                  </RowActions>
                )}
              </Row>
            );
          })}
        </DataTable>
      )}

      {creating ? (
        <TeamDrawer
          onClose={() => setCreating(false)}
          onCreated={(member, password) => {
            setCreating(false);
            setNewLogin({ name: member.name, email: member.email, password, reason: "created" });
            toast.success(`${member.name} can now sign in`);
            load();
          }}
        />
      ) : null}

      {resetTarget ? (
        <ConfirmDialog
          title={`Reset ${resetTarget.name}'s password?`}
          body={
            <>
              This clears any lockout and signs them out everywhere. A new temporary password will be
              shown once — you&apos;ll need to share it with them directly, and they&apos;ll be asked to
              choose their own the next time they sign in.
            </>
          }
          confirmLabel="Reset password"
          cancelLabel="Cancel"
          busy={resetting}
          onConfirm={() => void handleResetPassword()}
          onCancel={() => setResetTarget(null)}
        />
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Staff logins</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Who can sign in, and what each of them can reach.
      </p>
    </div>
  );
}
