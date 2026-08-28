"use client";

import { checkPasswordStrength, strengthLabel } from "../lib/password-strength";

/**
 * Live, encouraging password guidance — a strength bar plus a checklist that
 * fills in as each criterion is met, instead of a red "at least 8 characters"
 * thrown back only after a failed submit (DECISIONS.md, mockup review).
 * Renders nothing until the customer has actually started typing.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (password.length === 0) {
    return null;
  }
  const { hasMinLength, hasNumberOrSymbol, hasMixedCase, score } = checkPasswordStrength(password);
  const complete = score === 3;

  return (
    <div className="-mt-1 mb-3.5">
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-[rgba(18,48,44,0.12)]">
        <div
          className="h-full rounded-full transition-[width,opacity] duration-[var(--t-state)]"
          style={{ width: `${(score / 3) * 100}%`, background: "var(--dye)", opacity: complete ? 1 : 0.55 }}
        />
      </div>
      <p
        className="mb-1.5 text-[11.5px] font-bold"
        style={{ color: complete ? "var(--dye-press)" : "#5e6b60" }}
      >
        {strengthLabel(score)}
      </p>
      <ul className="flex flex-col gap-1">
        <ChecklistItem met={hasMinLength}>8 or more characters</ChecklistItem>
        <ChecklistItem met={hasNumberOrSymbol}>A number or symbol</ChecklistItem>
        <ChecklistItem met={hasMixedCase}>Upper &amp; lowercase letters</ChecklistItem>
      </ul>
    </div>
  );
}

function ChecklistItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li
      className="flex items-center gap-[7px] text-[11.5px] font-semibold"
      style={{ color: met ? "#2f6e5c" : "#8b978c" }}
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px]"
        style={{
          borderColor: met ? "var(--dye-press)" : "rgba(18,48,44,0.22)",
          background: met ? "var(--dye)" : "transparent",
        }}
      >
        {met ? (
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.5" stroke="#022B27" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      {children}
    </li>
  );
}
