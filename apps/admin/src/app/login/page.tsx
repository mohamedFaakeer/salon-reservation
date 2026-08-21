"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { ApiRequestError } from "../../lib/api-client";
import { isStaffOnly, isSuperAdmin } from "../../lib/permissions";
import { BusyLabel } from "../../components/spinner";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Never persisted: a revealed password must not survive a reload.
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(email, password);
      // SUPER_ADMIN has no tenant permissions, so /today would render an
      // empty shell and a failing dashboard request. A STAFF-only login has
      // no dashboard permission either, and belongs on the floor, not the desk.
      if (isSuperAdmin(user.roles)) {
        router.replace("/platform");
      } else if (isStaffOnly(user.roles)) {
        router.replace("/floor");
      } else {
        router.replace("/today");
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
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
              <button
                type="button"
                data-testid="toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute right-0 flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:text-slate-900"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
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

/** Drawn, not a glyph — one stroke weight shared with the rest of the app. */
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6.2 3.9A7.3 7.3 0 0 1 8 3.8c4.1 0 6.5 4.2 6.5 4.2a12 12 0 0 1-2 2.5M4 4.8A11.8 11.8 0 0 0 1.5 8S3.9 12.2 8 12.2c1 0 1.9-.2 2.7-.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m2.5 2.5 11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
