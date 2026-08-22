"use client";

import { useRef, useState } from "react";
import { ApiRequestError } from "../lib/api-client";
import { BusyLabel } from "./spinner";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2_000_000;

/**
 * Generic sibling of `LogoUploadField` — same "upload immediately on file
 * selection" shape, but the actual network call is supplied by the caller
 * (`upload`/`remove`) so one component covers both a product's own photo and
 * a variant's. The server's own message is shown as-is on failure: unlike
 * the logo field (which predates this pattern), there's no separate
 * code-to-copy map here — `PRODUCT_IMAGE_*` messages are already specific
 * enough (CLAUDE.md §5: "consistent envelope with actionable message").
 */
export function ImageUploadField({
  label,
  imageUrl,
  disabled,
  helpText,
  upload,
  remove,
  onChanged,
  testId,
  size = 76,
}: {
  label: string;
  imageUrl: string | null;
  disabled: boolean;
  helpText: string;
  upload: (file: File) => Promise<{ imageUrl: string | null }>;
  remove: () => Promise<{ imageUrl: string | null }>;
  onChanged: (imageUrl: string | null) => void;
  testId: string;
  size?: number;
}) {
  const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("That isn't a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is too large — the limit is ${MAX_BYTES / 1_000_000} MB.`);
      return;
    }
    setBusy("uploading");
    try {
      const result = await upload(file);
      onChanged(result.imageUrl ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't upload the photo right now. Please try again.");
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
      const result = await remove();
      onChanged(result.imageUrl ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove the photo right now.");
    } finally {
      setBusy(null);
    }
  }

  const inputId = `${testId}-file-input`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <span
          className="flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-[7px]"
          style={{ height: size, width: size }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-300" aria-hidden="true" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="m4 18 5-5 3 3 4-5 4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-900">{imageUrl ? "Uploaded" : "No photo yet"}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{helpText}</p>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              data-testid={inputId}
              disabled={disabled || busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleFile(file);
                }
              }}
              className="hidden"
              id={inputId}
            />
            <label
              htmlFor={inputId}
              className={`min-h-8 cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 ${disabled || busy !== null ? "pointer-events-none opacity-60" : ""}`}
            >
              <BusyLabel busy={busy === "uploading"} busyText="Uploading…">
                {imageUrl ? "Replace" : "Upload"}
              </BusyLabel>
            </label>
            {imageUrl ? (
              <button
                type="button"
                data-testid={`${testId}-remove`}
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
