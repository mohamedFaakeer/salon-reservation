"use client";

import { useState } from "react";
import { createTeamMember, type AssignableRole, type TeamMember } from "../lib/api-client";
import { MODULES } from "../lib/permissions";
import { errorCopy } from "../lib/error-copy";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { PasswordVisibilityToggle } from "./password-visibility-toggle";
import { useToast } from "./toast";

/**
 * Create a login for someone who works here.
 *
 * The screen shows what the chosen role can actually reach, derived from the
 * same permission predicates the sidebar uses. An owner handing out access
 * should be able to see what they are handing out, and a hand-written summary
 * would drift from the real matrix the first time it changed.
 *
 * The password is set here and shown once — the server keeps only an argon2
 * hash and genuinely cannot show it again. Same pattern as tenant provisioning.
 */

const ROLES: Array<{ value: AssignableRole; label: string; detail: string }> = [
  {
    value: "MANAGER",
    label: "Manager",
    detail: "Runs the salon day to day. Everything except handing out logins.",
  },
  {
    value: "RECEPTIONIST",
    label: "Receptionist",
    detail: "Books, checks in and takes payment. Cannot change prices or rotas.",
  },
  {
    value: "STAFF",
    label: "Stylist",
    detail: "Sees their own day and their own appointments only.",
  },
];

export function TeamDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: TeamMember, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Defaults visible, unlike every other password field in this app — this
  // one isn't a secret being protected from the person typing it, it's a
  // value the owner is about to read aloud or write down for someone else.
  // The toggle exists so they can still hide it (a coworker walks by, the
  // screen is shared), but starting hidden would reintroduce exactly the
  // transcription-typo risk this field's own history warns against.
  const [showPassword, setShowPassword] = useState(true);
  const [role, setRole] = useState<AssignableRole>("RECEPTIONIST");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = name.trim().length >= 2 && emailValid && password.length >= 8;

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const member = await createTeamMember({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      onCreated(member, password);
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="New login" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            data-testid="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            data-testid="team-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={email.length > 0 && !emailValid}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm aria-invalid:border-red-500"
          />
          <span className="text-xs text-slate-500">They sign in with this.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Temporary password</span>
          {/* Defaults visible (see showPassword above) — the toggle sits
              inside the field like every other password field, padding
              reserves its width so a long password never hides behind it. */}
          <span className="relative flex items-center">
            <input
              data-testid="team-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={password.length > 0 && password.length < 8}
              className="min-h-11 w-full rounded border border-slate-300 py-2 pl-3 pr-12 text-sm aria-invalid:border-red-500"
            />
            <PasswordVisibilityToggle
              testId="toggle-team-password"
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </span>
          <span className="text-xs text-slate-500">
            At least 8 characters. Shown once — the server keeps only a hash.
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-sm font-medium text-slate-700">What they can do</legend>
          {ROLES.map((option) => {
            const selected = role === option.value;
            return (
              <div
                key={option.value}
                className={`rounded border ${
                  selected ? "border-teal-500 bg-teal-50/60" : "border-slate-200"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3 p-3">
                  <input
                    type="radio"
                    name="team-role"
                    data-testid={`team-role-${option.value}`}
                    checked={selected}
                    onChange={() => setRole(option.value)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={
                        selected ? "text-sm font-semibold text-teal-900" : "text-sm text-slate-800"
                      }
                    >
                      {option.label}
                    </span>
                    <span className={selected ? "text-xs text-teal-800" : "text-xs text-slate-500"}>
                      {option.detail}
                    </span>
                  </span>
                </label>

                {selected ? (
                  <div className="border-t border-teal-200 px-3 py-3">
                    <RoleAccess role={option.value} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="team-save"
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Creating…">
              Create login
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

/** Read from the live permission predicates, so it cannot drift from the truth. */
export function RoleAccess({ role }: { role: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1" data-testid={`role-access-${role}`}>
      {MODULES.map((module) => {
        const allowed = module.can([role]);
        return (
          <li
            key={module.label}
            className={`flex items-center gap-1.5 text-xs ${
              allowed ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {allowed ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3.4 8.4 6.4 11.4 12.6 5"
                  stroke="#0d9488"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            <span className={allowed ? "" : "line-through decoration-slate-300"}>
              {module.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
