# apps/marketing SEO — Pending Manual Actions

Tracks the follow-up steps from the SEO pass (`docs/DECISIONS.md` #61) that only you can
do — dashboard/DNS actions outside the codebase. Delete each item (or this file, once
everything's checked off) as it's completed.

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
own detector already confirms the tag is live and correct). Should populate within a
few hours.

- [ ] Once Realtime shows real traffic, click through each CTA (demo, WhatsApp, phone,
      contact form) and confirm each event appears exactly once — no duplicates
- [ ] In GA4 (Admin → Events), mark `demo_click`, `demo_booked`, `whatsapp_click`,
      `phone_click`, `contact_form_submit` as key events

## 3. Google Search Console

- [ ] Open [Search Console](https://search.google.com/search-console), add a **Domain**
      property for `zelyraone.lk`
- [ ] Copy the DNS TXT verification record it gives you
- [ ] Add that TXT record at your domain's DNS provider
- [ ] Verify the property once DNS propagates
- [ ] Submit `https://zelyraone.lk/sitemap.xml` under Sitemaps
- [ ] Use URL Inspection on `https://zelyraone.lk/` and
      `https://zelyraone.lk/features` — Test Live URL, then Request Indexing for both

## Also flagged, not urgent

`PRODUCT.md` still says apps/marketing "deploys as a 4th Render service" — it actually
deploys to Cloudflare Pages (see `apps/marketing/next.config.ts`'s own comment). Doc
drift from before the hosting decision changed; worth a one-line fix whenever someone's
next in that file, not tied to this SEO work.
