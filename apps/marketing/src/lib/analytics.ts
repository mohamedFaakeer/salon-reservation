import { sendGAEvent } from "@next/third-parties/google";

/**
 * The six lead-generation events named in the SEO brief's CTA tracking plan
 * (Task 17). Every call site is typed to one of these — no ad-hoc event
 * names, so what actually gets measured always matches what's documented.
 */
export type CtaLocation = "hero" | "navigation" | "founding_banner" | "features_section" | "features_page" | "footer";

type AnalyticsEvent =
  | { name: "demo_click"; params: { cta_location: CtaLocation; cta_text: string } }
  | { name: "whatsapp_click"; params: { cta_location: "floating_button" | "contact_section" } }
  | { name: "phone_click"; params: { cta_location: "contact_section" } }
  | { name: "contact_form_start" }
  | { name: "contact_form_submit" }
  | { name: "demo_booked" };

/**
 * NEXT_PUBLIC_* vars are inlined at build time, so this check is free at
 * runtime and correct in both server and client contexts. When analytics
 * isn't configured, this stays false and every trackEvent call below is a
 * true no-op — no console noise (sendGAEvent itself would console.warn if
 * called before GoogleAnalytics ever mounted), no fake data.
 */
const GA_ENABLED = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

export function trackEvent(event: AnalyticsEvent): void {
  if (!GA_ENABLED) return;
  const params = "params" in event ? event.params : {};
  sendGAEvent("event", event.name, { ...params, page_path: window.location.pathname });
}
