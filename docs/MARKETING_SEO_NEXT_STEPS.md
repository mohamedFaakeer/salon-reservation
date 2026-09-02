# apps/marketing SEO — Pending Manual Actions

Tracks the follow-up steps from the SEO pass (`docs/DECISIONS.md` #61) that only you can
do — dashboard/DNS actions outside the codebase. Delete each item (or this file, once
everything's checked off) as it's completed.

## 1. Fix the production Calendly link

The local `.env.local` was corrected to `NEXT_PUBLIC_CALENDLY_LINK=faakeermohamed/30min`
(the Calendly event really is 30 minutes; the old `/15min` slug was just stale from an
earlier rename). **Cloudflare Pages' own environment variable for this still needs the
same fix** — updating the local file doesn't touch what's actually deployed.

- [ ] In the Cloudflare Pages dashboard for the `zelyraone.lk` project, update
      `NEXT_PUBLIC_CALENDLY_LINK` to `faakeermohamed/30min`
- [ ] Redeploy (or trigger a new build) so the change takes effect
- [ ] Spot-check `https://zelyraone.lk/#book-demo` opens the 30-minute event, not the
      old 15-minute one

## 2. Turn on GA4

Nothing fires yet — `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset, so `<GoogleAnalytics>`
never renders and every CTA event (`demo_click`, `whatsapp_click`, `phone_click`,
`contact_form_start`, `contact_form_submit`, `demo_booked`) is a safe no-op.

- [ ] Create a GA4 property at [analytics.google.com](https://analytics.google.com)
- [ ] Add a Web Data Stream for `https://zelyraone.lk`
- [ ] Copy its Measurement ID (starts with `G-`)
- [ ] Add `NEXT_PUBLIC_GA_MEASUREMENT_ID` to Cloudflare Pages' environment variables
- [ ] Redeploy
- [ ] Visit the live site, check GA4 Realtime shows the pageview
- [ ] Click through each CTA (demo, WhatsApp, phone, contact form) and confirm each
      event appears exactly once in Realtime — no duplicates
- [ ] In GA4, mark the events that matter as key events/conversions (`demo_click`,
      `demo_booked`, `whatsapp_click`, `phone_click`, `contact_form_submit` at minimum)

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
