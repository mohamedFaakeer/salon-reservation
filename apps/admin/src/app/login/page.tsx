"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { ApiRequestError } from "../../lib/api-client";
import { isSuperAdmin } from "../../lib/permissions";
import { BusyLabel } from "../../components/spinner";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(email, password);
      // SUPER_ADMIN has no tenant permissions, so /today would render an
      // empty shell and a failing dashboard request.
      router.replace(isSuperAdmin(user.roles) ? "/platform" : "/today");
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
        <div className="space-y-3">
          <input
            data-testid="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@salon.lk"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            data-testid="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <button
            data-testid="login-submit"
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
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
