"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, type Result } from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";

/**
 * Restricted to the 1D formats a retail counter actually sees (EAN/UPC on
 * packaging, Code128/39 on the odd internal label) — not QR/Aztec/PDF417,
 * which only cost decode time here and could false-match printed matter
 * elsewhere in frame (a poster, a till receipt).
 */
const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

/** The camera holds a steady barcode across dozens of frames — without this, one scan reads as twenty. */
const REPEAT_SUPPRESS_MS = 1500;

export function BarcodeScannerModal({
  onClose,
  onDecoded,
}: {
  onClose: () => void;
  /** Fired at most once per distinct code per REPEAT_SUPPRESS_MS window — never awaited, the modal stays open for the next scan. */
  onDecoded: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<{ text: string; at: number } | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result: Result | undefined, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled || !result) {
          return;
        }
        const text = result.getText();
        const now = Date.now();
        if (lastCodeRef.current?.text === text && now - lastCodeRef.current.at < REPEAT_SUPPRESS_MS) {
          return;
        }
        lastCodeRef.current = { text, at: now };
        onDecodedRef.current(text);
      })
      .then(() => {
        if (!cancelled) {
          setStarting(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStarting(false);
        setError(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Scan a barcode</h2>
          <button
            type="button"
            data-testid="scanner-close"
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-9 w-9 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline data-testid="scanner-video" />
          {!error ? <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" /> : null}
          {starting && !error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</div>
          ) : null}
        </div>

        <div className="px-4 py-3">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Hold a barcode steady inside the frame. Scanned items are added automatically — keep scanning to add more.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError") {
    return "Camera access was denied. Allow camera access in your browser settings and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No usable camera was found on this device.";
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "The camera needs a secure (HTTPS) connection to this page.";
  }
  return "Couldn't start the camera. Try again, or type the barcode instead.";
}
