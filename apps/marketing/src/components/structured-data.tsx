import { SITE_NAME, SITE_URL } from "../lib/site-config";

/**
 * Three conservative, truthful schemas — nothing here is a claim beyond
 * what's already stated elsewhere on the page:
 * - Organization: name/url/logo/phone, matching ContactSection exactly.
 * - WebSite: no SearchAction — this site has no on-site search, and adding
 *   one would be describing a capability that doesn't exist.
 * - SoftwareApplication: category/description only — no offers, pricing,
 *   or aggregateRating, since none of those are real (SEO brief explicitly
 *   forbids fabricating them).
 *
 * Rendered as a native <script> per Next's own JSON-LD guide (next/script
 * is for executable JS, not structured data) with the recommended `<`
 * escape — defense in depth even though every value here is a hardcoded
 * literal, never user input.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/branding/zelyra-logo.svg`,
      telephone: "+94771932264",
      areaServed: "LK",
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Salon management software for appointments, customers, staff, POS, payments, and reports, built for Sri Lankan salons.",
      url: SITE_URL,
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
    />
  );
}
