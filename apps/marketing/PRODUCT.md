# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 + Tailwind 4, new `apps/marketing` npm workspace — matches
`apps/admin`/`apps/web` exactly (confirmed with the user, not delegated).
Deploys as a 4th Render service, same 3-line build/start recipe, at the
domain `zelyraone.lk`.

## Users

Two distinct audiences read this page for different reasons, on one scroll:

1. A wellness-business owner or decision-maker in Colombo (salon, barber,
   med-spa, wellness studio, or beauty-product retailer) evaluating whether
   to become a ZelyraOne merchant partner. They currently run bookings by
   phone/WhatsApp/walk-in, are skeptical of software vendors, and are
   deciding whether this is worth a 30-minute demo call — not whether to
   buy outright. This page cannot close the sale by itself; it only needs
   to earn the call.
2. A consumer encountering "ZelyraOne for Customers" — via a partner
   business or this page directly — deciding whether it's a real reason to
   book online next time instead of calling.

## Product Purpose

Convert visitors into: (a) merchant partners who book a real 30-minute
demo call, and (b) legitimacy/awareness for the customer booking app.
Campaign success (2-week window) is 50 booked demo calls with Colombo-area
wellness merchants. Per-visit success is a completed Calendly booking or,
at minimum, a visitor who now understands what ZelyraOne actually does for
their specific business type.

## Positioning

The same availability engine handles a walk-in, a phone call, a WhatsApp
message, and an online booking — with the database itself making
double-booking impossible, not app-level checks. Customers book in under
60 seconds with no account required. Built for Colombo's operating
realities (LKR, Asia/Colombo time, local business rhythms) rather than a
foreign product adapted after the fact. (Public-safe framing adapted from
`docs/COMPETITIVE_BATTLE_CARD.md`; its internal pricing/objection-script
content is explicitly excluded from this page.)

## Operating Context

- Launch window: 2 weeks, explicit goal of 50 merchant partners in Colombo.
- Every merchant-facing CTA routes to a real Calendly-hosted 30-minute demo
  booking (the user's own calendar, free plan) — switched from the
  originally-planned Cal.com when the user set up Calendly instead — no
  self-serve merchant signup exists yet.
- No public pricing appears anywhere on the page — merchant subscription
  pricing isn't formally ratified beyond an internal sales draft.
- A time-boxed "Founding 50" cohort incentive is part of the page's
  structure; exact offer terms (what's actually waived or locked in) are
  still undecided and must not be invented — say "founding-partner terms,"
  never a specific number, until the user confirms them.
- WhatsApp automation and live online payment (PayHere) are real product
  stubs today, not shipped features — never claim either as working.
- Standard lifecycle emails don't yet honor the admin's editable-template
  system (known gap) — don't promise "fully customizable emails."

## Capabilities and Constraints

**Real, working today (safe to claim):** one shared availability engine
across every booking channel; database-enforced no-double-booking;
sub-60-second no-account customer booking; SMS confirmations/reminders via
Text.lk (real, not a stub); Cloudinary-backed photo/logo uploads; manual
payment recording (cash/bank/card) in the admin app; multi-staff/
multi-service scheduling; a real audit log.

**Not real yet — must not be claimed:** WhatsApp automation (`501` stub),
a live online payment gateway (PayHere stub, unbuilt), self-serve merchant
signup, editable email templates actually affecting sent mail, native
mobile apps, loyalty/gift cards/memberships (explicit MVP non-goals per
`docs/PRD.md`).

**Domain**: `zelyraone.lk` is confirmed and owned by the user.
`business.zelyraone.lk` (admin) and `book.zelyraone.lk` (customer app) are
its planned subdomains — not live yet, this page's own launch is what
establishes the domain in production.

## Brand Commitments

- Product name: **ZelyraOne**. Two sub-brands: **ZelyraOne for Business**
  (merchant/admin platform) and **ZelyraOne for Customers** (booking app).
- Logo: the user-supplied mark (teal wordmark + crossed-scissors icon),
  already the default logo asset across both product apps
  (`/branding/zelyra-logo.svg`) — reuse this exact asset, never redraw it.
- `apps/web`'s "Wax-Resist" visual system (batik-dye metaphor, `--dye`/
  `--resist` tokens, Anybody + Familjen Grotesk fonts) is explicitly scoped
  by its own DESIGN.md to the customer product only — not a binding
  constraint here. The ZelyraOne teal (the logo mark's `#029591`-family
  hue) **is** a binding brand color regardless of whichever new visual
  world this page adopts.
- Voice sampled from the shipped product: short declarative sentences,
  second person, concrete numbers ("60 seconds," never "fast"), no
  corporate hedging — e.g. `apps/web`'s own hero: "Every time you see is a
  time you can take."

## Evidence on Hand

- **418 real UAT screenshots** at `docs/uat_screenshots/` — actual
  captures of the running admin app (booking, attendance, bundles, auth,
  audit, and more). Usable as real "product in action" proof once
  hand-curated — many are raw test-workflow captures, not polished
  marketing shots, so picking matters.
- `apps/web/public/img/` has 3 Unsplash-licensed generic salon-interior/
  chair/styling photos and 4 generic stylist portraits — usable filler for
  the customer-facing half if the direction calls for photography beyond
  product screenshots, but they are explicitly stock, not
  brand-differentiated.
- **No testimonials, case studies, press mentions, or client logos exist**
  — this is the business's first client. Do not fabricate any of these;
  the page earns trust through product mechanism and specificity, not
  social proof that doesn't exist yet.
- `docs/COMPETITIVE_BATTLE_CARD.md` has extensive ready-made positioning
  and comparison language (its pricing/sales-script sections are
  internal-only and excluded; its comparison framing and one-liners are
  safe to adapt for public copy).

## Product Principles

1. Never claim a capability that isn't real today — WhatsApp automation
   and live payments are the two most tempting overclaims to avoid.
2. Every merchant-facing CTA leads to one place: a real, bookable 30-minute
   Calendly demo slot — never a price, never a generic "contact us" dead end.
3. Prove the mechanism, not the brand — the "one engine" claim is falsifiable
   and specific; lean on that over generic SaaS reassurance language.
4. Two audiences, one page, no confusion — a visitor should always know
   within one screen which half (Business or Customers) they're reading.
5. This is a 2-week, first-client-stakes launch — the founding-cohort
   urgency mechanic exists to serve that real timeline, not as decoration.

## Accessibility & Inclusion

No project-specific requirement beyond the standard the existing apps
already hold themselves to (per `docs/UX.md`): 4.5:1 text contrast,
visible keyboard focus, 44px minimum touch targets. Carry the same floor
here.
