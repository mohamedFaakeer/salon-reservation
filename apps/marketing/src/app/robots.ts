import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site-config";

// Required for `output: "export"` — without this, `next build` refuses to
// collect page data for this route (confirmed via the actual build error,
// not documented explicitly in this Next version's static-exports guide).
export const dynamic = "force-static";

/**
 * apps/marketing is a single-route static export with no admin, auth, or
 * API surface of its own — business.zelyraone.lk (admin) and
 * book.zelyraone.lk (customer booking) are separate subdomains, not paths
 * under this domain, and aren't live yet (see PRODUCT.md). So there is
 * nothing on zelyraone.lk itself that needs excluding from crawling.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
