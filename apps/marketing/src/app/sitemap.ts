import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site-config";

// Required for `output: "export"` — see robots.ts for the same note.
export const dynamic = "force-static";

/**
 * Only the homepage exists today — this app has exactly one route. When a
 * future public page is added (e.g. /features), add its entry here; nothing
 * else about this file's shape needs to change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
