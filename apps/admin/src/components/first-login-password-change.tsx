"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError, completeFirstLogin, type LoginResponse } from "../lib/api-client";
import { BusyLabel } from "./spinner";
import { PasswordVisibilityToggle } from "./password-visibility-toggle";

/**
 * The mandatory "set a new password" screen `login/page.tsx` swaps in when
 * the server returns a change-token instead of a session — the current
 * password was set by someone else (account creation, or an
 * OWNER/MANAGER/SUPER_ADMIN reset), so it must be replaced before any real
 * access is granted (account-lockout-v2, DECISIONS.md — mirrors AWS
 * Cognito's/Okta's NEW_PASSWORD_REQUIRED challenge, not a dismissible
 * post-login reminder).
 */
export function FirstLoginPasswordChange({
  changeToken,
  onComplete,
}: {
  changeToken: string;
  onComplete: (result: LoginResponse) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Those two passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await completeFirstLogin(changeToken, newPassword);
      onComplete(result);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Could not set your new password. Please try signing in again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Set a new password</h1>
        <p className="mb-6 text-sm text-slate-500">
          This login was just created or reset for you. Choose a password only you know before continuing.
        </p>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">New password</span>
            <span className="relative flex items-center">
              <input
                data-testid="first-login-new-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-300 py-2 pl-3 pr-12 text-sm"
              />
              <PasswordVisibilityToggle
                testId="toggle-first-login-new-password"
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </span>
            <span className="text-xs text-slate-500">At least 8 characters.</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Confirm new password</span>
            <input
              data-testid="first-login-confirm-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch}
              className={`min-h-11 w-full rounded border px-3 text-sm ${mismatch ? "border-red-400" : "border-slate-300"}`}
            />
            {mismatch ? <span className="text-xs text-red-600">Doesn&apos;t match yet.</span> : null}
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            data-testid="first-login-submit"
            type="submit"
            disabled={submitting}
            className="min-h-11 w-full rounded bg-teal-600 px-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BusyLabel busy={submitting} busyText="Setting password…">
              Set password and continue
            </BusyLabel>
          </button>
        </div>
      </form>
    </main>
  );
}
