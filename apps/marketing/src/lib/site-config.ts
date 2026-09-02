/**
 * Single source of truth for the values every SEO-facing file needs — the
 * canonical domain and the brand name. Referenced by layout.tsx (metadata +
 * JSON-LD), robots.ts, and sitemap.ts so none of them hardcode the same
 * string twice. Kept intentionally small: this is still a one-route site,
 * so a full page-metadata registry (Task 25 in the SEO brief) would be
 * over-engineering until a second public page actually exists.
 */
export const SITE_URL = "https://zelyraone.lk";
export const SITE_NAME = "ZelyraOne";
