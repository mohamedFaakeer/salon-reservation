"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ApiRequestError,
  sendPhoneOtp,
  verifyPhoneOtp,
  type CustomerAuthResult,
} from "../lib/api-client";
import { DyeButton, Marker } from "./cloth";
import { BusyLabel } from "./spinner";

const CODE_LENGTH = 6;
/**
 * A courtesy delay on this screen only — the real limit is server-side
 * (`customer-otp-send`: 3 per 10 minutes per phone, SECURITY.md). This just
 * stops someone mashing "Resend" while a text is still in flight.
 */
const RESEND_COOLDOWN_S = 45;

/**
 * Six boxes, auto-advance, paste-fills-all-six — the Uber/PickMe pattern
 * (DECISIONS.md, mockup review). Reused from two entry points: the "Account
 * created" screen's own verify step, and the booking-confirmation button
 * when a logged-in account's phone isn't verified yet — one implementation,
 * not two.
 */
export function OtpEntry({
  phone,
  onVerified,
  onChangeNumber,
}: {
  phone: string;
  onVerified: (result: CustomerAuthResult) => void;
  onChangeNumber?: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "wrong" | "locked">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const sentOnce = useRef(false);

  // A code is already waiting by the time this screen appears — matching
  // "we already texted you", not "press send to begin".
  useEffect(() => {
    if (sentOnce.current) {
      return;
    }
    sentOnce.current = true;
    void sendPhoneOtp(phone).catch(() => {
      // Surfacing this would only tell the customer something they can already
      // see: no code arrives, and "Resend code" is right there once the
      // cooldown (started optimistically below) runs out.
    });
  }, [phone]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function focusIndex(i: number): void {
    inputRefs.current[i]?.focus();
  }

  function handleChange(i: number, raw: string): void {
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length > 1) {
      // A pasted code landed in one box — spread it across the rest.
      setDigits((prev) => {
        const next = [...prev];
        for (let k = 0; k < digitsOnly.length && i + k < CODE_LENGTH; k++) {
          next[i + k] = digitsOnly[k];
        }
        return next;
      });
      focusIndex(Math.min(i + digitsOnly.length, CODE_LENGTH - 1));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[i] = digitsOnly;
      return next;
    });
    if (digitsOnly && i < CODE_LENGTH - 1) {
      focusIndex(i + 1);
    }
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      focusIndex(i - 1);
    }
  }

  // Auto-submits the instant the sixth digit lands — no separate "Verify" tap.
  useEffect(() => {
    const code = digits.join("");
    if (code.length === CODE_LENGTH && status !== "locked" && !verifying) {
      void submit(code);
    }
    // Intentionally keyed on `digits` alone — `status`/`verifying` changing
    // on their own must not re-trigger a submit of whatever is still typed.
  }, [digits]);

  async function submit(code: string): Promise<void> {
    setVerifying(true);
    setMessage(null);
    try {
      const result = await verifyPhoneOtp(phone, code);
      onVerified(result);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "OTP_LOCKED") {
        setStatus("locked");
        setMessage(err.message);
      } else {
        setStatus("wrong");
        setMessage(err instanceof ApiRequestError ? err.message : "That code isn't right. Please try again.");
        setDigits(Array(CODE_LENGTH).fill(""));
        focusIndex(0);
      }
    } finally {
      setVerifying(false);
    }
  }

  async function resend(): Promise<void> {
    setResending(true);
    setMessage(null);
    setStatus("idle");
    setDigits(Array(CODE_LENGTH).fill(""));
    try {
      await sendPhoneOtp(phone);
      setCooldown(RESEND_COOLDOWN_S);
      focusIndex(0);
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : "Could not send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <Marker>Step 1 of 1</Marker>
      <h2 className="display mt-2 text-[24px] text-[var(--resist)]">
        Verify your
        <span className="block">number.</span>
      </h2>
      <p className="mt-1 text-[13px] text-[var(--resist-dim)]">
        Enter the 6-digit code we sent to <b className="text-[var(--resist)]">{phone}</b>.
      </p>

      <div className="mt-5 grid grid-cols-6 gap-2" role="group" aria-label="6-digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            disabled={status === "locked" || verifying}
            aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
            // `min-w-0` overrides the browser's intrinsic min-width for <input>
            // (driven by its `size` attribute default) — without it, a grid/flex
            // track can't shrink the box below that, and `aspect-square` then
            // blows the height out to match the oversized width.
            className={`display aspect-square w-full min-w-0 rounded-[13px] border-[1.5px] bg-[var(--dye-mid)] text-center text-[22px] text-[var(--resist)] outline-none transition-colors duration-[var(--t-tap)] disabled:opacity-35 ${
              status === "wrong"
                ? "anim-shake border-[#E0665C] bg-[rgba(224,102,92,0.1)]"
                : d
                  ? "border-[var(--bloom)] bg-[rgba(123,227,208,0.08)]"
                  : "border-[rgba(240,231,214,0.14)]"
            }`}
          />
        ))}
      </div>

      {message ? (
        <p
          role="alert"
          className={`mt-3 rounded-[var(--radius-sm)] p-2.5 text-[12.5px] font-semibold ${
            status === "locked"
              ? "border border-[rgba(224,163,60,0.45)] bg-[rgba(224,163,60,0.12)] text-[var(--alarm)]"
              : "border border-[rgba(224,102,92,0.4)] bg-[rgba(224,102,92,0.12)] text-[#ffb4ac]"
          }`}
        >
          {message}
        </p>
      ) : null}

      {onChangeNumber ? (
        <p className="mt-3 text-[12px] text-[var(--resist-dim)]">
          Wrong number?{" "}
          <button type="button" onClick={onChangeNumber} className="font-bold text-[var(--bloom)]">
            Change it
          </button>
        </p>
      ) : null}

      <div className="mt-5 border-t border-[rgba(240,231,214,0.14)] pt-4 text-center">
        {status === "locked" ? (
          <DyeButton onClick={() => void resend()} disabled={resending} className="w-full">
            <BusyLabel busy={resending} busyText="Sending…">
              Send a new code
            </BusyLabel>
          </DyeButton>
        ) : cooldown > 0 ? (
          <p className="text-[12.5px] text-[var(--resist-dim)]">
            Resend code in{" "}
            <span className="tabular font-bold text-[var(--resist)]">0:{String(cooldown).padStart(2, "0")}</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending}
            className="text-[12.5px] font-bold text-[var(--bloom)] disabled:opacity-60"
          >
            <BusyLabel busy={resending} busyText="Sending…">
              Resend code
            </BusyLabel>
          </button>
        )}
      </div>
    </div>
  );
}
