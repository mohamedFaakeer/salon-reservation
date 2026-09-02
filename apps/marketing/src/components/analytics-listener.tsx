"use client";

import { useEffect } from "react";
import { trackEvent, type CtaLocation } from "../lib/analytics";

const CTA_LOCATIONS: readonly CtaLocation[] = ["hero", "navigation", "founding_banner", "features_section", "footer"];

function isCtaLocation(value: string | undefined): value is CtaLocation {
  return CTA_LOCATIONS.includes(value as CtaLocation);
}

/**
 * One delegated document-level click listener instead of converting every
 * CTA's component (hero, site-nav, founding-banner, site-footer,
 * floating-whatsapp — all plain server components today) to a client
 * component just to attach an onClick. Each trackable element instead
 * carries plain data-analytics/data-cta-location/data-cta-text attributes
 * (see hero.tsx, site-nav.tsx, founding-banner.tsx, site-footer.tsx,
 * floating-whatsapp.tsx, contact-section.tsx), and this is the only new
 * client-side JS the CTA-tracking plan (SEO brief Task 17) actually needs.
 *
 * Only mounted when GA is configured (see layout.tsx) — visitors get zero
 * extra JS for this until analytics is actually wired up.
 */
export function AnalyticsListener() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-analytics]");
      if (!el) return;

      const analytics = el.dataset.analytics;
      switch (analytics) {
        case "demo_click": {
          const ctaLocation = el.dataset.ctaLocation;
          if (!isCtaLocation(ctaLocation)) return;
          trackEvent({
            name: "demo_click",
            params: { cta_location: ctaLocation, cta_text: el.textContent?.trim() ?? "" },
          });
          return;
        }
        case "whatsapp_click": {
          const ctaLocation = el.dataset.ctaLocation;
          if (ctaLocation !== "floating_button" && ctaLocation !== "contact_section") return;
          trackEvent({ name: "whatsapp_click", params: { cta_location: ctaLocation } });
          return;
        }
        case "phone_click":
          trackEvent({ name: "phone_click", params: { cta_location: "contact_section" } });
          return;
        default:
          return;
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
