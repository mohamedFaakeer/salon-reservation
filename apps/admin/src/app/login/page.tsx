import React from "react";

export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Salon Admin</h1>
        <p className="mb-6 text-sm text-slate-500">
          Sign in to manage your day. Auth flows arrive in Phase 2.
        </p>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="you@salon.lk"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled
            className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white opacity-60"
          >
            Sign in (coming in Phase 2)
          </button>
        </div>
      </div>
    </main>
  );
}