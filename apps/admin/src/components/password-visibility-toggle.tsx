"use client";

/**
 * The show/hide control every typed-password field in this app uses
 * (account-lockout-v2, DECISIONS.md) — extracted from the login page, which
 * had the only copy of this until the forced-first-login-change screen and
 * `TeamDrawer`'s temporary-password field needed the identical behavior.
 *
 * Each caller still owns its own `<input>`, `showPassword` state, and
 * `relative`/`pr-12` wrapper — only the toggle button and its two icons are
 * shared, so each field's own validation/testid/layout stays untouched.
 */
export function PasswordVisibilityToggle({
  visible,
  onToggle,
  testId,
}: {
  visible: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onToggle}
      aria-pressed={visible}
      aria-label={visible ? "Hide password" : "Show password"}
      title={visible ? "Hide password" : "Show password"}
      className="absolute right-0 flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:text-slate-900"
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
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
