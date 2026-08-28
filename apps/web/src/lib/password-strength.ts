/**
 * Guidance, not a gate. The server enforces one real rule — 8 to 128
 * characters (`CustomerSignupDto`) — and that alone decides whether the form
 * can submit. `hasNumberOrSymbol`/`hasMixedCase` only drive the encouraging
 * checklist a customer sees while typing; failing them never blocks sign-up.
 */
export interface PasswordStrength {
  hasMinLength: boolean;
  hasNumberOrSymbol: boolean;
  hasMixedCase: boolean;
  /** 0–3: how many of the three criteria above are met. */
  score: number;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8;
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password);
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const score = [hasMinLength, hasNumberOrSymbol, hasMixedCase].filter(Boolean).length;
  return { hasMinLength, hasNumberOrSymbol, hasMixedCase, score };
}

export function strengthLabel(score: number): string {
  switch (score) {
    case 0:
      return "Add a number or symbol, and mix upper & lowercase.";
    case 1:
      return "Getting there — a couple more to go.";
    case 2:
      return "Almost — one more to go.";
    default:
      return "Strong password.";
  }
}
