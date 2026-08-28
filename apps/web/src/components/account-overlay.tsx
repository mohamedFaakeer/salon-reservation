"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, customerSignup } from "../lib/api-client";
import { useCustomerAuth } from "../context/customer-auth-context";
import { DyeButton } from "./cloth";
import { BusyLabel } from "./spinner";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { OtpEntry } from "./otp-entry";

const PHONE_PATTERN = /^\+?[0-9\s-]{7,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One overlay, five screens (prompt/signup/created/login/otp), one place the
 * whole optional-account flow lives — mounted once, near the root, so the
 * booking-confirm button (`payment-step.tsx`) can open straight to `otp`
 * without a second implementation. Guest booking never touches this file.
 */
export function AccountOverlay() {
  const auth = useCustomerAuth();
  if (auth.screen === "none") {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(4,33,31,0.6)] sm:items-center sm:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          auth.close();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="relative w-full max-w-md rounded-t-[26px] bg-[var(--dye-mid)] p-6 pb-[calc(env(safe-area-inset-bottom)+22px)] sm:rounded-[26px]"
      >
        <button
          type="button"
          onClick={auth.close}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(240,231,214,0.1)] text-[var(--resist)]"
        >
          ✕
        </button>

        <div key={auth.screen} className="anim-rise">
          {auth.screen === "prompt" ? <PromptScreen /> : null}
          {auth.screen === "signup" ? <SignupScreen /> : null}
          {auth.screen === "created" ? <CreatedScreen /> : null}
          {auth.screen === "login" ? <LoginScreen /> : null}
          {auth.screen === "otp" ? (
            <OtpEntry phone={auth.pendingPhone ?? ""} onVerified={auth.applyVerifiedSession} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PromptScreen() {
  const auth = useCustomerAuth();
  return (
    <div>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--dye)]">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.5c1.4 2 3 3.2 3 5.3A3 3 0 0 1 5 6.8c0-2.1 1.6-3.3 3-5.3Z"
            fill="#022B27"
          />
          <path
            d="M8 9.2v5.3M5.3 12.2 8 14.5l2.7-2.3"
            stroke="#022B27"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="display text-[22px] text-[var(--resist)]">
        Unlock
        <span className="block">one-tap booking.</span>
      </h2>
      <p className="mt-2 text-[13px] leading-[1.55] text-[var(--bloom)]">
        Create an account to save your details across every salon on here — verify your number once,
        then book in seconds, every time after.
      </p>
      <DyeButton className="mt-5 w-full" testId="account-prompt-signup" onClick={() => auth.goTo("signup")}>
        Sign up
      </DyeButton>
      <div className="mt-3.5 text-center">
        <TextLink onClick={() => auth.goTo("login")}>Log in</TextLink>
      </div>
    </div>
  );
}

function SignupScreen() {
  const auth = useCustomerAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);

  const phoneValid = PHONE_PATTERN.test(phone.trim());
  const emailValid = EMAIL_PATTERN.test(email.trim());
  const passwordValid = password.length >= 8;
  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && phoneValid && emailValid && passwordValid && termsAccepted;

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setAlreadyExists(false);
    try {
      await customerSignup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
        termsAccepted,
      });
      auth.goTo("created", { phone: phone.trim(), firstName: firstName.trim() });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "ACCOUNT_EXISTS") {
        setAlreadyExists(true);
      }
      setError(err instanceof ApiRequestError ? err.message : "Could not create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="display text-[24px] text-[var(--resist)]">
        Create your
        <span className="block">account.</span>
      </h2>
      <p className="mb-5 mt-1 text-[12.5px] text-[var(--resist-dim)]">
        Takes under a minute. One account works at every salon on here.
      </p>

      <DyeField label="First name" value={firstName} onChange={setFirstName} testId="account-first-name" />
      <DyeField label="Last name" value={lastName} onChange={setLastName} testId="account-last-name" />
      <DyeField
        label="Mobile number"
        value={phone}
        onChange={setPhone}
        inputMode="tel"
        testId="account-phone"
        error={touched && !phoneValid ? "Enter a valid mobile number." : null}
      />
      <DyeField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        testId="account-email"
        error={touched && !emailValid ? "Enter a valid email address." : null}
      />
      <DyeField label="Password" type="password" value={password} onChange={setPassword} testId="account-password" />
      <PasswordStrengthMeter password={password} />

      <label className="mb-4 flex items-start gap-2.5 text-[12.5px] leading-[1.5] text-[var(--resist-dim)]">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--bloom)]"
        />
        <span>
          I agree to the{" "}
          <a className="font-bold text-[var(--bloom)] underline underline-offset-2">Terms &amp; Conditions</a> and{" "}
          <a className="font-bold text-[var(--bloom)] underline underline-offset-2">Privacy Policy</a>.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-sm)] border border-[rgba(224,102,92,0.4)] bg-[rgba(224,102,92,0.12)] p-2.5 text-[12.5px] font-semibold text-[#ffb4ac]"
        >
          {error}{" "}
          {alreadyExists ? (
            <button
              type="button"
              onClick={() => auth.goTo("login", { phone: phone.trim() })}
              className="underline"
            >
              Log in instead →
            </button>
          ) : null}
        </p>
      ) : null}

      <DyeButton type="submit" testId="account-signup-submit" disabled={submitting} className="w-full">
        <BusyLabel busy={submitting} busyText="Creating…">
          Create account
        </BusyLabel>
      </DyeButton>
      <div className="mt-3.5 text-center text-[12.5px] text-[var(--resist-dim)]">
        Already have an account? <TextLink onClick={() => auth.goTo("login")}>Log in</TextLink>
      </div>
    </form>
  );
}

function CreatedScreen() {
  const auth = useCustomerAuth();
  return (
    <div className="flex flex-col items-center py-3 text-center">
      <div className="mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-[var(--dye)] anim-bloom">
        <svg width="30" height="30" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5l3.2 3.2L13 4.5" stroke="#022B27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="display text-[24px] text-[var(--resist)]">
        You&apos;re in,
        <span className="block">{auth.pendingFirstName ?? "there"}.</span>
      </h2>
      <p className="mt-2 max-w-[250px] text-[13px] leading-[1.6] text-[var(--bloom)]">
        One more thing when you&apos;re ready — verify your number and you&apos;ll never type these
        details again.
      </p>
      <DyeButton className="mt-6 w-full" testId="account-verify-now" onClick={() => auth.goTo("otp")}>
        Verify mobile number
      </DyeButton>
      <div className="mt-3.5">
        <TextLink onClick={auth.close}>I&apos;ll do this later</TextLink>
      </div>
    </div>
  );
}

function LoginScreen() {
  const auth = useCustomerAuth();
  const [phone, setPhone] = useState(auth.pendingPhone ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!phone.trim() || !password) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(phone.trim(), password);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not log you in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="display text-[24px] text-[var(--resist)]">
        Welcome
        <span className="block">back.</span>
      </h2>

      {error ? (
        <p
          role="alert"
          className="mb-4 mt-4 rounded-[var(--radius-sm)] border border-[rgba(224,102,92,0.4)] bg-[rgba(224,102,92,0.12)] p-2.5 text-[12.5px] font-semibold text-[#ffb4ac]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <DyeField label="Mobile number" value={phone} onChange={setPhone} inputMode="tel" testId="login-phone" />
        <DyeField label="Password" type="password" value={password} onChange={setPassword} testId="login-password" />
      </div>

      <DyeButton type="submit" testId="login-submit" disabled={submitting} className="mt-1 w-full">
        <BusyLabel busy={submitting} busyText="Logging in…">
          Log in
        </BusyLabel>
      </DyeButton>
      <div className="mt-3.5 text-center text-[12.5px] text-[var(--resist-dim)]">
        New here?{" "}
        <TextLink onClick={() => auth.goTo("signup")}>Sign up to unlock one-tap booking</TextLink>
      </div>
    </form>
  );
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[13.5px] font-bold text-[var(--bloom)]">
      {children}
    </button>
  );
}

function DyeField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  testId,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "text" | "tel" | "email";
  testId?: string;
  error?: string | null;
}) {
  return (
    <label className="mb-3.5 flex flex-col gap-1.5 text-[12.5px] font-bold text-[var(--resist)]">
      {label}
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.18)] bg-[var(--dye-deep)] px-3.5 text-[15px] font-normal text-[var(--resist)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--bloom)]"
      />
      {error ? (
        <span role="alert" className="text-[11.5px] font-semibold text-[#ffb4ac]">
          {error}
        </span>
      ) : null}
    </label>
  );
}
