"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { ApiRequestError } from "../../lib/api-client";
import { isStaffOnly, isSuperAdmin } from "../../lib/permissions";
import { BusyLabel } from "../../components/spinner";
import { PasswordVisibilityToggle } from "../../components/password-visibility-toggle";
import { FirstLoginPasswordChange } from "../../components/first-login-password-change";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Never persisted: a revealed password must not survive a reload.
  const [showPassword, setShowPassword] = useState(false);
  // Set only when the server returns a change-token instead of a session
  // (the password was set by someone else — creation, or a reset) — the
  // form below is swapped for the mandatory "set a new password" screen,
  // with zero functional access granted until that completes.
  const [changeToken, setChangeToken] = useState<string | null>(null);

  function proceedFor(roles: string[]): void {
    // SUPER_ADMIN has no tenant permissions, so /today would render an
    // empty shell and a failing dashboard request. A STAFF-only login has
    // no dashboard permission either, and belongs on the floor, not the desk.
    if (isSuperAdmin(roles)) {
      router.replace("/platform");
    } else if (isStaffOnly(roles)) {
      router.replace("/floor");
    } else {
      router.replace("/today");
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      if ("requiresPasswordChange" in result) {
        setChangeToken(result.changeToken);
        return;
      }
      proceedFor(result.roles);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (changeToken) {
    return (
      <FirstLoginPasswordChange
        changeToken={changeToken}
        onComplete={(result) => {
          const loggedInUser = loginWithSession(result);
          proceedFor(loggedInUser.roles);
        }}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Salon Admin</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to manage your day.</p>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input
              data-testid="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@salon.lk"
              className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Password</span>
            {/* The toggle sits inside the field rather than beside it, so the
                label still describes one control. Padding on the input
                reserves the button's width — overlaying it on top of typed
                text is how a long password ends up hidden behind its own
                reveal button. */}
            <span className="relative flex items-center">
              <input
                data-testid="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-300 py-2 pl-3 pr-12 text-sm"
              />
              <PasswordVisibilityToggle
                testId="toggle-password"
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </span>
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            data-testid="login-submit"
            type="submit"
            disabled={submitting}
            className="min-h-11 w-full rounded bg-teal-600 px-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BusyLabel busy={submitting} busyText="Signing in…">
              Sign in
            </BusyLabel>
          </button>
        </div>
      </form>
    </main>
  );
}
