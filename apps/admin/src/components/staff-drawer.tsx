"use client";

import { useEffect, useState } from "react";
import {
  createStaff,
  fetchIncentivePlans,
  fetchTeam,
  updateStaff,
  type IncentivePlanView,
  type StaffGender,
  type StaffMember,
  type TeamMember,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { StaffPhotoField } from "./staff-photo-field";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";
import { useAuth } from "../context/auth-context";
import { canManageTeam } from "../lib/permissions";

/**
 * Calendar colours, offered as a fixed palette rather than a free hex field.
 *
 * The colour is not decoration: it is how a receptionist tells one staff
 * column from another on the day board. A free input invites four
 * near-identical greys, and the API only accepts #RRGGBB anyway. Every value
 * here clears 3:1 against white so the dot stays visible (WCAG 1.4.11).
 */
const PALETTE = [
  "#4F46E5",
  "#DB2777",
  "#F59E0B",
  "#0891B2",
  "#059669",
  "#7C3AED",
  "#DC2626",
  "#475569",
] as const;

export function StaffDrawer({
  member,
  onClose,
  onSaved,
}: {
  /** Omit to create. */
  member?: StaffMember;
  onClose: () => void;
  /** `staffId` is passed so creating can hand straight over to skill assignment. */
  onSaved: (staffId: string, wasCreated: boolean) => void;
}) {
  const editing = Boolean(member);

  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [specialties, setSpecialties] = useState(member?.specialties ?? "");
  const [color, setColor] = useState(
    member?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
  );
  const [incentivePlanId, setIncentivePlanId] = useState(member?.incentivePlanId ?? "");
  const [plans, setPlans] = useState<IncentivePlanView[]>([]);
  const [userId, setUserId] = useState(member?.userId ?? "");
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? "");
  const [gender, setGender] = useState<StaffGender | "">(member?.gender ?? "");
  // Local, since a photo upload/removal happens against the real record
  // immediately (StaffPhotoField), independent of this drawer's own Save —
  // `member` itself won't reflect it until the parent list reloads.
  const [photoUrl, setPhotoUrl] = useState(member?.imageUrl ?? null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { user } = useAuth();
  const canLinkLogin = canManageTeam(user?.roles ?? []);

  useEffect(() => {
    fetchIncentivePlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (!canLinkLogin) {
      return;
    }
    fetchTeam()
      .then(setTeamMembers)
      .catch(() => setTeamMembers([]));
    // Only the Owner can see the team roster (MANAGE_TEAM), so this is fetched
    // once on mount for them and left empty for everyone else — canLinkLogin
    // can't change during the drawer's lifetime.
  }, [canLinkLogin]);

  const linkableMembers = teamMembers.filter(
    (m) =>
      m.role === "STAFF" &&
      (m.staffId === null || m.staffId === member?.id) &&
      (m.status === "ACTIVE" || m.userId === member?.userId),
  );

  const canSubmit = name.trim().length > 0;

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const common = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        specialties: specialties.trim() || undefined,
        color,
        jobTitle: jobTitle.trim() || undefined,
      };
      const saved = member
        ? await updateStaff(member.id, {
            ...common,
            incentivePlanId: incentivePlanId || null,
            userId: userId || null,
            gender: gender || null,
          })
        : await createStaff({ ...common, userId: userId || undefined, gender: gender || undefined });
      onSaved(saved.id, !member);
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={editing ? "Edit stylist" : "Add stylist"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {member ? (
          <StaffPhotoField staffId={member.id} imageUrl={photoUrl} onChanged={setPhotoUrl} />
        ) : (
          <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            You can add a photo once this stylist is saved.
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            data-testid="staff-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Phone <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="staff-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+94 77 …"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Specialties <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea
            data-testid="staff-specialties"
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            rows={2}
            placeholder="Notes for the team — not shown to customers"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Job title <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              data-testid="staff-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Senior Stylist"
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            <span className="text-xs text-slate-500">Shown publicly, under their name.</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Gender <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <select
              data-testid="staff-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as StaffGender | "")}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            >
              <option value="">Not shown</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
            </select>
            <span className="text-xs text-slate-500">Display only — never affects booking.</span>
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-slate-700">Calendar colour</legend>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((hex) => {
              const selected = color.toUpperCase() === hex;
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-pressed={selected}
                  aria-label={`Colour ${hex}`}
                  data-testid={`staff-color-${hex.slice(1)}`}
                  className={`h-9 w-9 rounded-md border-2 ${
                    selected ? "border-slate-900" : "border-transparent"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>
        </fieldset>

        {canLinkLogin ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Linked login <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <select
              data-testid="staff-linked-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            >
              <option value="">No login — bookable only</option>
              {linkableMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              Lets them sign in and see their own schedule, attendance and earnings.
            </span>
          </label>
        ) : null}

        {editing ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Incentive plan <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <select
              value={incentivePlanId}
              onChange={(e) => setIncentivePlanId(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            >
              <option value="">No plan — no commission earned</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
            You&apos;ll pick which services {name.trim() || "this stylist"} performs next — until
            then they won&apos;t appear as bookable.
          </p>
        )}

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="staff-save"
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              {editing ? "Save changes" : "Add and choose skills"}
            </BusyLabel>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
