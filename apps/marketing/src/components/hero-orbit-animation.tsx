import type { CSSProperties } from "react";

/**
 * The hero's right-side animation — "Precision Orbit," ported from a
 * separately-generated reference (ZelyraOne-Hero-Animation-Variants). Only
 * the orbit variant is kept; the reference's second "Bento Bloom" variant
 * and its unused code are dropped since nothing here renders it.
 *
 * Everything is pure CSS `@keyframes` driving `transform`/`opacity`/`filter`
 * (see the "Hero orbit animation" block in globals.css) — never `width`/
 * `height`/`top`/`left`, so nothing here triggers layout on every frame.
 * `prefers-reduced-motion` freezes it to its resting frame (same file).
 *
 * Decorative only: `aria-hidden` throughout, and never anything clickable —
 * the actual conversion content is the headline/copy this sits beside in
 * `hero.tsx`, unchanged.
 */

type IconName = "scissors" | "comb" | "spray" | "calendar" | "money" | "time" | "people";

function Icon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "scissors":
      return (
        <svg {...common}>
          <circle cx="6" cy="17" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="m8.6 15.5 8-11.5M15.4 15.5 7.4 4" />
        </svg>
      );
    case "comb":
      return (
        <svg {...common}>
          <path d="M4 6h16v5H4zM6 11v7M9 11v5M12 11v7M15 11v5M18 11v7" />
        </svg>
      );
    case "spray":
      return (
        <svg {...common}>
          <path d="M9 8h8l1 3v9H8v-9zM11 8V5h5M16 5h3M19 5l2-1M19 7l2 1" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 17h2" />
        </svg>
      );
    case "money":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <path d="M7 10h.01M17 15h.01M9 12.5c.8-1.8 5.2-1.8 6 0s-1 3-3 3-3.8-1.2-3-3Z" />
        </svg>
      );
    case "time":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19c.6-3.4 2.6-5 6-5s5.4 1.6 6 5M16 6c2 .2 3 1.2 3 3s-1 2.8-3 3M17 14c2.5.5 3.8 2.2 4 5" />
        </svg>
      );
  }
}

const modules: Array<[string, IconName, string]> = [
  ["Appointments", "calendar", "12"],
  ["Revenue", "money", "84.5k"],
  ["Team", "people", "6"],
  ["On time", "time", "96%"],
];

/** The mocked-up phone dashboard at the center of the orbit. */
function Phone() {
  return (
    <article className="hero-phone" aria-hidden="true">
      <div className="hero-phone-screen">
        {/* This site's real logo + wordmark pairing (site-nav.tsx's own
            convention) — not the reference's own, different logo asset. */}
        <div className="phone-head">
          <img src="/branding/zelyra-logo.svg" alt="" />
          <span>ZelyraOne</span>
          <i />
        </div>
        <p className="phone-kicker">Good morning</p>
        <h3>Your business, today</h3>
        <div className="phone-modules">
          {modules.map(([name, icon, value]) => (
            <div className="phone-module" key={name}>
              <span>
                <Icon name={icon} />
              </span>
              <small>{name}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="phone-chart">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    </article>
  );
}

const orbitTools: Array<[IconName, string, number, number, number]> = [
  ["scissors", "Services", -235, -155, 0],
  ["comb", "Team", 126, -212, 0.28],
  ["spray", "Products", 224, -64, 0.56],
  ["calendar", "Bookings", 190, 145, 0.84],
  ["money", "Payments", -208, 150, 1.12],
  ["time", "Schedule", -267, -6, 1.4],
];

function toolStyle(x: number, y: number, delay: number): CSSProperties {
  return { "--x": `${x}px`, "--y": `${y}px`, "--delay": `${delay}s` } as CSSProperties;
}

export function HeroOrbitAnimation() {
  return (
    <div className="hero-animation" aria-label="Animated ZelyraOne business platform preview">
      <div className="orbit-stage">
        <div className="orbit-aura" />
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <div className="orbit-ring ring-three" />
        {orbitTools.map(([icon, label, x, y, delay]) => (
          <div className="orbit-tool" style={toolStyle(x, y, delay)} aria-hidden="true" key={label}>
            <span>
              <Icon name={icon} />
            </span>
            <small>{label}</small>
          </div>
        ))}
        <Phone />
        <div className="orbit-caption">
          <b>Everything connected</b>
          <span>One calm workspace</span>
        </div>
      </div>
    </div>
  );
}
