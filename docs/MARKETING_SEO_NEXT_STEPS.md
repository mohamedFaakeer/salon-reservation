# apps/marketing SEO — Manual Actions (Completed)

Tracked the follow-up steps from the SEO pass (`docs/DECISIONS.md` #61) that only the
user could do — dashboard/DNS actions outside the codebase. All three are done as of
2026-09-03; kept as a record of what was set up (env var values, GA4 property, Search
Console verification) rather than deleted, since that's useful reference if anyone
needs to touch this configuration again.

## 1. Fix the production Calendly link — ✅ Done (2026-09-03)

`NEXT_PUBLIC_CALENDLY_LINK` updated to `faakeermohamed/30min` in Cloudflare Pages and
redeployed (via an empty commit — the dashboard had no visible manual redeploy button).

## 2. Turn on GA4 — ✅ Code/config done, dashboard still catching up (2026-09-03)

`NEXT_PUBLIC_GA_MEASUREMENT_ID=G-04T63JQWS3` is set in Cloudflare Pages and deployed.
Verified two independent ways:
- A live automated browser visit captured the real network request landing at
  `google-analytics.com/g/collect` with the correct `tid` and `en=page_view`.
- GA4's own **Admin → Get started → Set up data collection → Take action** live checker
  confirmed: *"Your Google tag was correctly detected on your website."*

Realtime and DebugView were still showing 0 users right after setup — that's normal
backend-processing lag for a freshly created GA4 account, not a setup problem (Google's
own detector already confirms the tag is live and correct).

- [ ] Once Realtime shows real traffic, click through each CTA (demo, WhatsApp, phone,
      contact form) and confirm each event appears exactly once — no duplicates
- [ ] In GA4 (Admin → Events), mark `demo_click`, `demo_booked`, `whatsapp_click`,
      `phone_click`, `contact_form_submit` as key events

(Left as open checkboxes deliberately — they depend on Realtime actually populating,
which wasn't confirmed yet as of this file's last update. Everything required to make
that happen is done.)

## 3. Google Search Console — ✅ Done (2026-09-03)

`zelyraone.lk` added as a **Domain** property and verified via DNS TXT record.
`sitemap.xml` submitted (showed "Couldn't fetch" immediately after submission — checked
the file directly: HTTP 200, correct `Content-Type: application/xml`, correct content;
also checked Cloudflare's Security Insights and confirmed Bot Fight Mode is **not**
enabled, ruling out Cloudflare interference. This was the same first-fetch processing
lag pattern seen with GA4 above, not a misconfiguration — expected to resolve to
"Success" once Google's crawler makes its first pass).

Two unrelated things Cloudflare's Security Insights surfaced while checking this,
neither blocking anything today:
- **Unproxied CNAME records** for `book.zelyraone.lk` and `business.zelyraone.lk`
  (DNS-only, not proxied through Cloudflare) — fine while those subdomains aren't live
  yet (per `PRODUCT.md`), but exposes the origin IP directly once something's listening
  there. Worth proxying before either goes live.
- Cloudflare auto-injects `Disallow` rules for AI crawlers (`GPTBot`, `ClaudeBot`,
  `Google-Extended`, etc.) into the served `robots.txt` at the zone level — not
  something in this codebase, and doesn't affect regular Googlebot/Search indexing
  (`Google-Extended` is Google's separate AI-training crawler). Only relevant if there's
  ever a reason to want AI systems referencing the site.

## Also flagged, not urgent

`PRODUCT.md` still says apps/marketing "deploys as a 4th Render service" — it actually
deploys to Cloudflare Pages (see `apps/marketing/next.config.ts`'s own comment). Doc
drift from before the hosting decision changed; worth a one-line fix whenever someone's
next in that file, not tied to this SEO work.
