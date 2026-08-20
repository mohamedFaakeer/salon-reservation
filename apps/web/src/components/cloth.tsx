import type { ReactNode } from "react";

/**
 * The two grounds of the world, and the controls that sit on them.
 *
 * Cloth comes out of the bath in one of two states, and every surface in the
 * app is one or the other: still in the dye, or pulled out and undyed. Keeping
 * them as components rather than utility strings is what stops a third,
 * accidental ground appearing halfway through the flow.
 */

/** Still in the bath. The default ground. */
export function Dyed({
  children,
  className = "",
  crackle = false,
}: {
  children: ReactNode;
  className?: string;
  crackle?: boolean;
}) {
  return (
    <div
      className={`relative bg-[var(--dye-deep)] text-[var(--resist)] ${
        crackle ? "crackle" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Pulled out and dry. Used where reading matters more than atmosphere. */
export function Undyed({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative bg-[var(--resist)] text-[var(--ink)] ${className}`}>{children}</div>
  );
}

/**
 * A photograph, dyed into the palette.
 *
 * Every image is desaturated and composited under the dye so a replacement
 * photo cannot arrive in colours that break the world. `luminosity` keeps the
 * shape and throws away the hue.
 */
export function DyedPhoto({
  src,
  alt,
  className = "",
  position = "center",
  drift = false,
}: {
  src: string;
  alt: string;
  className?: string;
  position?: string;
  drift?: boolean;
}) {
  return (
    <span aria-hidden={alt === "" ? "true" : undefined} className={`absolute inset-0 overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover opacity-45 mix-blend-luminosity grayscale contrast-125 ${
          drift ? "anim-drift" : ""
        }`}
        style={{ objectPosition: position }}
        loading="lazy"
        decoding="async"
      />
      <span className="absolute inset-0 bg-[linear-gradient(200deg,rgba(15,163,150,0.45),rgba(4,33,31,0.92))]" />
    </span>
  );
}

/**
 * The primary action. "Lit" is the selected/active state of the whole system —
 * exactly one element per screen carries it, which is what makes it readable at
 * arm's length in sunlight.
 */
export function DyeButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  tone = "dye",
  className = "",
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  tone?: "dye" | "quiet" | "onDye";
  className?: string;
  testId?: string;
}) {
  const tones: Record<string, string> = {
    dye: "bg-[var(--dye)] text-[#022B27] hover:bg-[var(--dye-press)] shadow-[0_12px_28px_-14px_var(--dye)] disabled:bg-[var(--dye-mid)] disabled:text-[var(--resist-dim)] disabled:shadow-none",
    quiet:
      "bg-transparent text-[var(--resist)] border-[1.5px] border-[rgba(240,231,214,0.28)] hover:border-[var(--bloom)]",
    onDye: "bg-[#022B27] text-[var(--bloom)] hover:bg-[#043733]",
  };
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition-colors duration-[var(--t-tap)] disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Small caps label. Never sits above a heading — it labels its own object. */
export function Marker({ children, on = "dye" }: { children: ReactNode; on?: "dye" | "cloth" }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
        on === "dye" ? "text-[var(--bloom)]" : "text-[#6E7A55]"
      }`}
    >
      {children}
    </span>
  );
}
