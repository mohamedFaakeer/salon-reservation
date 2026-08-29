"use client";

import { useRef, useState } from "react";
import { ApiRequestError, removeStaffPhoto, uploadStaffPhoto } from "../lib/api-client";
import { BusyLabel } from "./spinner";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2_000_000;

const ERROR_COPY: Record<string, string> = {
  STAFF_PHOTO_FILE_TOO_LARGE: "That file is too large — the limit is 2 MB.",
  STAFF_PHOTO_INVALID_FILE_TYPE: "That isn't a PNG, JPEG or WebP image.",
  STAFF_PHOTO_DIMENSIONS_OUT_OF_RANGE: "Image dimensions must be between 200×200 and 4000×4000px.",
  STAFF_PHOTO_ASPECT_RATIO_INVALID: "That's an unusually elongated shape for a portrait — keep it within 2:1.",
  STAFF_PHOTO_UPLOAD_NOT_CONFIGURED: "Photo uploads aren't turned on for this environment yet.",
};

/**
 * A stylist's public headshot — same "uploads immediately, no separate save
 * step" convention as `LogoUploadField`, since a file isn't a diffable text
 * value that belongs in the drawer's own draft state. Only rendered once a
 * stylist actually has an id (editing, not creating): there's nowhere to
 * upload a photo to before the row exists.
 */
export function StaffPhotoField({
  staffId,
  imageUrl,
  onChanged,
}: {
  staffId: string;
  imageUrl: string | null;
  onChanged: (imageUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `staff-photo-file-${staffId}`;

  async function handleFile(file: File): Promise<void> {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(ERROR_COPY.STAFF_PHOTO_INVALID_FILE_TYPE);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(ERROR_COPY.STAFF_PHOTO_FILE_TOO_LARGE);
      return;
    }
    setBusy("uploading");
    try {
      const updated = await uploadStaffPhoto(staffId, file);
      onChanged(updated.imageUrl);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (ERROR_COPY[err.code] ?? err.message)
          : "Couldn't upload the photo right now. Please try again.",
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
      const updated = await removeStaffPhoto(staffId);
      onChanged(updated.imageUrl);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove the photo right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Photo</span>
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-slate-300" aria-hidden="true" focusable="false">
              <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 20c1.6-3.6 4.8-5.5 8-5.5s6.4 1.9 8 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-900">{imageUrl ? "Uploaded" : "No photo yet"}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            PNG, JPEG or WebP · up to 2 MB · 200–4000px per side. Shown on the salon&apos;s public booking page.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              data-testid="staff-photo-file-input"
              disabled={busy !== null}
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
              className={`min-h-8 cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 ${busy !== null ? "pointer-events-none opacity-60" : ""}`}
            >
              <BusyLabel busy={busy === "uploading"} busyText="Uploading…">
                {imageUrl ? "Replace" : "Upload"}
              </BusyLabel>
            </label>
            {imageUrl ? (
              <button
                type="button"
                data-testid="staff-photo-remove"
                onClick={() => void handleRemove()}
                disabled={busy !== null}
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
