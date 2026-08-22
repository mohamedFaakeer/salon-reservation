"use client";

import { useState } from "react";
import { ApiRequestError, provisionTenant, type PlanTier, type ProvisionTenantResult } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

/**
 * Create a salon and its first owner.
 *
 * This is the only screen in the product that sets somebody else's password,
 * so it says plainly that the password is shown once and never again — the
 * server stores an argon2 hash and cannot reveal it later.
 *
 * The slug is generated from the salon name but stays editable, because it
 * becomes the customer-facing booking URL and is fixed at provisioning.
 */

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function ProvisionTenantDrawer({
  onClose,
  onProvisioned,
}: {
  onClose: () => void;
  onProvisioned: (result: ProvisionTenantResult, password: string) => void;
}) {
  const [salonName, setSalonName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [tier, setTier] = useState<PlanTier>("PRO");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(salonName);
  const slugValid = SLUG_PATTERN.test(effectiveSlug) && effectiveSlug.length >= 3;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim());
  const passwordValid = ownerPassword.length >= 8;
  const canSubmit =
    salonName.trim().length >= 2 &&
    slugValid &&
    ownerName.trim().length >= 2 &&
    emailValid &&
    passwordValid;

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await provisionTenant({
        salonName: salonName.trim(),
        slug: effectiveSlug,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        tier,
      });
      onProvisioned(result, ownerPassword);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create this salon.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="New salon" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Salon name</span>
          <input
            data-testid="provision-salon-name"
            value={salonName}
            onChange={(e) => setSalonName(e.target.value)}
            placeholder="Serenity Spa"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Booking link</span>
          <span className="flex items-center gap-1">
            <span className="text-sm text-slate-500">/salon/</span>
            <input
              data-testid="provision-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              aria-invalid={effectiveSlug.length > 0 && !slugValid}
              className="min-h-11 flex-1 rounded border border-slate-300 px-3 text-sm aria-invalid:border-red-500"
            />
          </span>
          <span className={slugValid || !effectiveSlug ? "text-xs text-slate-500" : "text-xs font-medium text-red-700"}>
            {slugValid || !effectiveSlug
              ? "Lowercase letters, numbers and hyphens. Fixed once the salon exists."
              : "At least 3 characters: lowercase letters, numbers and single hyphens."}
          </span>
        </label>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Plan</legend>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="provision-tier-lite"
              aria-pressed={tier === "LITE"}
              onClick={() => setTier("LITE")}
              className={`flex-1 rounded-lg border-[1.5px] px-3 py-2 text-left text-sm font-semibold ${
                tier === "LITE" ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-700"
              }`}
            >
              Lite
            </button>
            <button
              type="button"
              data-testid="provision-tier-pro"
              aria-pressed={tier === "PRO"}
              onClick={() => setTier("PRO")}
              className={`flex-1 rounded-lg border-[1.5px] px-3 py-2 text-left text-sm font-semibold ${
                tier === "PRO" ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-700"
              }`}
            >
              Pro
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Adjustable any time from "Manage plan" on the salon list.</p>
        </fieldset>

        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
            First owner
          </p>

          <div className="mt-2 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Name</span>
              <input
                data-testid="provision-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                data-testid="provision-owner-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                aria-invalid={ownerEmail.length > 0 && !emailValid}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm aria-invalid:border-red-500"
              />
              <span className="text-xs text-slate-500">They sign in with this.</span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Temporary password</span>
              <input
                data-testid="provision-owner-password"
                type="text"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                aria-invalid={ownerPassword.length > 0 && !passwordValid}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm aria-invalid:border-red-500"
              />
              {/* Shown rather than masked on purpose: the operator has to read
                  it back to the owner, and masking a value you must transcribe
                  causes typos, not security. */}
              <span
                className={
                  passwordValid || !ownerPassword
                    ? "text-xs text-slate-500"
                    : "text-xs font-medium text-red-700"
                }
              >
                {passwordValid || !ownerPassword
                  ? "At least 8 characters. Shown once — the server keeps only a hash."
                  : "At least 8 characters."}
              </span>
            </label>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="provision-submit"
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Creating…">
              Create salon
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
