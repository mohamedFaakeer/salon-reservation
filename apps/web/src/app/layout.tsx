import React from "react";
import type { Metadata } from "next";
import { Anybody, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { CustomerAuthProvider } from "../context/customer-auth-context";
import { AccountOverlay } from "../components/account-overlay";

/**
 * Display: Anybody, a variable face whose width axis is the point — it
 * stretches wide like a stamp pressed into cloth. Body: Familjen Grotesk.
 * Both self-hosted by next/font, so there is no third-party font request and
 * no flash of fallback text on a cold Render instance.
 */
const display = Anybody({
  subsets: ["latin"],
  // Both axes stay variable: the width axis is the whole point of this face,
  // and next/font rejects `axes` alongside a fixed weight list.
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

const body = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

/**
 * The direction contract this build is accountable to.
 *
 * Emitted as a real HTML comment rather than a JSX one, because JSX comments
 * are compiled away and never reach the document — a contract nobody can read
 * in production is a contract nobody can audit. `dangerouslySetInnerHTML` is
 * the only way React emits a comment node; the string is a literal with no
 * interpolation and no user input anywhere near it.
 */
const DIRECTION_CONTRACT = `<!--
  IMPECCABLE DIRECTION CONTRACT — seed 9ab4fc5d

  THESIS: A booking is claimed the way dye claims cloth. Refuses the category's
  white-card-and-teal-button arrangement, and refuses the warm-cream-and-
  terracotta spa page that every model ships.

  OWN-WORLD: Sri Lankan batik. Over-dipped teal ground, undyed cream as the
  negative, indigo only where a second bath overlaps, static crackle as the hand
  mark. Colour is a strict legend: teal means bookable and nothing else uses it.

  STORY: The visitor understands every time on screen is genuinely free,
  believes the salon is real because its stylists and hours are named, and takes
  the soonest slot without making an account.

  FIRST VIEWPORT: A saturated teal field fills the screen; CLAIM / THE CHAIR set
  wide across it, the second line in undyed cream; the search bar straddles the
  seam where the dye ends.

  FORM: Wax-resist dyeing, candidate 7 of 7 on the grounded list, seed 9ab4fc5d.

  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, DESIGN.md, and every shipping raster carrying its
  provenance.
-->`;

export const metadata: Metadata = {
  title: "Claim the chair",
  description:
    "Every time you see is a time you can take. Book a salon appointment in under 60 seconds — no account.",
  themeColor: "#04211F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <CustomerAuthProvider>
          {children}
          <AccountOverlay />
        </CustomerAuthProvider>
      </body>
    </html>
  );
}
