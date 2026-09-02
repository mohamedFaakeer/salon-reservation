import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { DM_Sans, Fira_Code, Plus_Jakarta_Sans } from "next/font/google";
import { AnalyticsListener } from "../components/analytics-listener";
import { IntroLoader } from "../components/intro-loader";
import { StructuredData } from "../components/structured-data";
import { SITE_NAME, SITE_URL } from "../lib/site-config";
import "./globals.css";

// Unset until a real GA4 property exists — see the SEO report's "manual
// actions" checklist for how to create one. No component renders at all
// until this is set: no placeholder ID, no analytics call that silently
// goes nowhere.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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

// Meta description intentionally says "30-minute demo" (not the SEO brief's
// drafted "15-minute demo") — confirmed with the user that 30 minutes is the
// site's actual, current demo length; every visible CTA already says the same.
const DESCRIPTION =
  "ZelyraOne is salon management software built for Sri Lankan salons. Manage appointments, customers, staff, POS, payments, salaries, incentives, sales and reports in one system. Book a 30-minute demo.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Salon Management Software Sri Lanka | ZelyraOne",
  description: DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Salon Management Software Sri Lanka | ZelyraOne",
    description:
      "Manage appointments, customers, staff, POS, payments, salaries, incentives, sales and reports with ZelyraOne. Built for Sri Lankan salons.",
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_LK",
    // No og:image yet — no asset on the site is a correct 1200x630 social
    // card (see structured-data/layout audit). A real one is a follow-up;
    // omitting is safer than shipping a wrong-aspect-ratio image.
  },
  twitter: {
    card: "summary",
    title: "Salon Management Software Sri Lanka | ZelyraOne",
    description:
      "Manage appointments, customers, staff, POS, payments, salaries, incentives, sales and reports with ZelyraOne. Built for Sri Lankan salons.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {/* PROVENANCE is the hardcoded literal defined above — no runtime interpolation, not reachable by user input. */}
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: PROVENANCE }} />
        <StructuredData />
        {GA_MEASUREMENT_ID && (
          <>
            <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
            <AnalyticsListener />
          </>
        )}
        <IntroLoader />
        {children}
      </body>
    </html>
  );
}
