import type { Metadata } from "next";
import { DM_Sans, Fira_Code, Plus_Jakarta_Sans } from "next/font/google";
import { IntroLoader } from "../components/intro-loader";
import "./globals.css";

/**
 * Self-hosted via next/font, matching apps/web's convention — no
 * third-party font request and no flash of fallback text on a cold
 * Render instance.
 */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const mono = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * This build's provenance, recorded the same way apps/web records its own
 * direction — as a real HTML comment (JSX comments never reach the DOM), so
 * the choice is auditable in production, not just in this file.
 *
 * Unlike apps/web's Wax-Resist system, this page did not go through
 * new-work's dice-assigned direction process: the user named an existing,
 * ready-made design system (apps/marketing/verdana-health-design-system-
 * DESIGN.md) and asked for it directly, skipping that step deliberately.
 * The one confirmed departure from that doc is recorded in DESIGN.md and in
 * globals.css: Tertiary Sage (#059669) is replaced with ZelyraOne teal
 * (#029591) everywhere the doc calls for "links, CTAs, highlights", to
 * satisfy PRODUCT.md's binding-brand-color commitment. See
 * apps/marketing/DESIGN.md for the full record.
 */
const PROVENANCE = `<!--
  ZelyraOne marketing site — visual source: verdana-health-design-system-DESIGN.md
  Confirmed substitution: Sage #059669 -> ZelyraOne teal #029591 (links, CTAs,
  highlights, chip-active, focus rings). Everything else in that doc — navy,
  slate, spacing, radius, elevation, type scale, component shapes — is used
  as written. Single-theme (light) by deliberate choice: the source doc only
  specifies one mode. Full record: apps/marketing/DESIGN.md
-->`;

export const metadata: Metadata = {
  title: "ZelyraOne — One engine for every booking",
  description:
    "ZelyraOne runs the walk-in, the phone call, the WhatsApp message, and the online booking through the same engine — so Colombo's salons, barbers, and wellness studios never double-book again.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {/* PROVENANCE is the hardcoded literal defined above — no runtime interpolation, not reachable by user input. */}
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: PROVENANCE }} />
        <IntroLoader />
        {children}
      </body>
    </html>
  );
}
