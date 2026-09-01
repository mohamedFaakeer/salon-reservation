import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export: this app has no API routes, server actions, or dynamic
  // routes — it's pure static content plus client-side third-party embeds
  // (Calendly, Cloudinary video). Cloudflare Pages serves the `out/`
  // directory this produces as plain static files, at $0, with no
  // server/cold-start behavior at all (see apps/marketing/DESIGN.md and
  // the go-live plan for why Render's free tier was ruled out here).
  output: "export",
};

export default nextConfig;
