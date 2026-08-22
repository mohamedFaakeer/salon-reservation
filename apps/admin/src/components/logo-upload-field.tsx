"use client";

import { useRef, useState } from "react";
import { ApiRequestError, removeTenantLogo, uploadTenantLogo } from "../lib/api-client";
import { BusyLabel } from "./spinner";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1_000_000;

const ERROR_COPY: Record<string, string> = {
  LOGO_FILE_TOO_LARGE: "That file is too large — the limit is 1 MB.",
  LOGO_INVALID_FILE_TYPE: "That isn't a PNG, JPEG or WebP image.",
  LOGO_DIMENSIONS_OUT_OF_RANGE: "Image dimensions must be between 200×200 and 4000×4000px.",
  LOGO_ASPECT_RATIO_INVALID: "That's a banner shape, not a logo mark — keep it within 2:1.",
  LOGO_UPLOAD_NOT_CONFIGURED: "Logo uploads aren't turned on for this environment yet.",
};

/**
 * Uploads immediately on file selection rather than joining the page's own
 * draft/save flow — a file isn't a diffable text value, and "pick a file,
 * then remember to hit Save changes" is a worse shape than the upload
 * simply happening. Client-side type/size checks give fast feedback; the
 * server's four constraint checks are the real authority (CLAUDE.md: no
 * client-side business logic) and their codes are translated here.
 */
export function LogoUploadField({
  logoUrl,
  disabled,
  onChanged,
}: {
  logoUrl: string | null;
  disabled: boolean;
  onChanged: (logoUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(ERROR_COPY.LOGO_INVALID_FILE_TYPE);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(ERROR_COPY.LOGO_FILE_TOO_LARGE);
      return;
    }
    setBusy("uploading");
    try {
      const settings = await uploadTenantLogo(file);
      onChanged(settings.logoUrl ?? null);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (ERROR_COPY[err.code] ?? err.message)
          : "Couldn't upload the logo right now. Please try again.",
      );
    } finally {
      setBusy(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleRemove(): Promise<void> {
    setError(null);
    setBusy("removing");
    try {
      const settings = await removeTenantLogo();
      onChanged(settings.logoUrl ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove the logo right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Logo</span>
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-[7px]">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-300" aria-hidden="true" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="m4 18 5-5 3 3 4-5 4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-900">
            {logoUrl ? "Uploaded" : "No logo yet"}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            PNG, JPEG or WebP · up to 1 MB · 200–4000px per side, roughly square. Shown on the
            navigation bar and printed on every invoice.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              data-testid="logo-file-input"
              disabled={disabled || busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleFile(file);
                }
              }}
              className="hidden"
              id="logo-file-input"
            />
            <label
              htmlFor="logo-file-input"
              className={`min-h-8 cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 ${disabled || busy !== null ? "pointer-events-none opacity-60" : ""}`}
            >
              <BusyLabel busy={busy === "uploading"} busyText="Uploading…">
                {logoUrl ? "Replace" : "Upload"}
              </BusyLabel>
            </label>
            {logoUrl ? (
              <button
                type="button"
                data-testid="logo-remove"
                onClick={() => void handleRemove()}
                disabled={disabled || busy !== null}
                className="min-h-8 rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BusyLabel busy={busy === "removing"} busyText="Removing…">
                  Remove
                </BusyLabel>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
