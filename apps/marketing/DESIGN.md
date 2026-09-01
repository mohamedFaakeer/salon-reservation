# Design

<!-- impeccable:design-schema 1 -->

## Mode

Persuade. This surface exists to earn a booked demo call (merchant side) or
trust in the booking app (customer side) — design is the product here, not
a container around it.

## Visual world

**Source of truth**: `apps/marketing/verdana-health-design-system-DESIGN.md`
— an existing, ready-made design system the user named directly and asked
to be used as-is, rather than a world produced through new-work's dice-
assigned direction process. That process (concept-seed, 7 challenger
directions, a committed thesis) was deliberately skipped for this surface;
there is no seed or candidate number to record here because none was rolled.

**Confirmed substitution** (the one deliberate departure from the source
doc): everywhere it specifies Tertiary Sage (`#059669`) — links, CTAs,
highlights, chip-active state, focus rings — this build uses ZelyraOne teal
(`#029591`, the logo mark's hue) instead. This exists to satisfy
`PRODUCT.md`'s binding-brand-color commitment ("The ZelyraOne teal ... is a
binding brand color regardless of whichever new visual world this page
adopts"). Everything else the source doc specifies — Navy `#0F172A`, Slate
`#64748B`, the 8px spacing scale, the radius scale, the diffused-shadow
elevation system, the type scale, and every component shape — is used
exactly as written, not reinterpreted.

**Single theme**: light only, by deliberate choice. The source doc
specifies one mode, built around a light, calm, clinical surface — an
undocumented dark variant would not be "the design system," it would be a
guess nobody asked for.

## Typography

- Display: Plus Jakarta Sans (500/600/700/800), self-hosted via
  `next/font/google`, `--font-display`.
- Body: DM Sans (400/500/600/700), self-hosted, `--font-body`.
- Mono: Fira Code (400/500), self-hosted, `--font-mono` — reserved for the
  one place tabular alignment matters (the hero panel's slot times).

## Color tokens

Defined in `src/app/globals.css`. Navy/slate/border/bg/surface/success/
warning/error match the source doc's literal hex values. `--teal` and its
`-dark`/`-tint`/`-tint-strong` variants are the confirmed substitution for
the doc's Tertiary Sage, used for every CTA, the active chip state, and
`::selection`/`accent-color`.

## Component decisions

- **Buttons**: `.btn-primary` (teal fill) is reserved for the actual
  conversion actions — "Book a demo," "Claim a founding spot." `.btn-navy`
  and `.btn-secondary` follow the source doc's literal Buttons spec (navy
  fill / navy outline) for everything else. This reading reconciles two
  things the source doc says separately: its Buttons section specifies navy
  as Primary, while its Colors section calls out Sage/teal for "links,
  CTAs, highlights" — the highest-priority conversion buttons get the
  accent; standard chrome does not.
- **Chips**: used once, for the partner-eligibility tags (Hair Salons,
  Barbershops, Med-Spas, Wellness Studios, Beauty Retailers) — the source
  doc's "Filter Active" chip spec, teal instead of sage.
- **Checkboxes, radios, lists, tooltips**: not used. The only form on the
  page is the Calendly booking embed, which renders its own UI — inventing
  a custom form just to use those components would not be honest use of
  the system.
- **Cards/elevation**: the video sections' recreated-UI frames and the
  hero's availability panel use the source doc's `lg`/`md` shadow values,
  never an invented shadow.

## Motion

One authored moment: the hero's availability panel shows a slot's status
pill swap from "Open" to "Booked" once on load (`slot-animated` in
`globals.css`), representing the double-booking-prevention claim visually
rather than only asserting it. Every other section uses a single reusable
primitive (`<Reveal>`, `src/components/reveal.tsx`): opacity + an 8-16px
lift, ~400ms, triggered once via `IntersectionObserver`, never re-firing on
scroll-back. Both respect `prefers-reduced-motion` (CSS-level, not a JS
branch) by rendering fully visible with no transition. No animation
library is used — plain CSS transitions and one observer, matching this
project's dependency discipline (`CLAUDE.md` §3: no new library without
justification).

## Content notes

- The two "How it works" flows are the only place step numbers appear —
  real sequences, not decoration.
- Screenshots are recreated UI (navy gradient frame + ghost panels), not
  the real `docs/uat_screenshots/` — those carry "UAT"-suffixed test names
  and, in at least one capture, the developer's own real name as a test
  customer.
- Both demo-walkthrough videos are real, hosted on the user's own
  Cloudinary account (`VideoSection` renders a native `<video>` element;
  the poster frame is derived from the video itself via Cloudinary's
  `so_0` transformation, no separate poster upload needed).
- The demo-booking section (`DemoBooking`) reads `NEXT_PUBLIC_CALENDLY_LINK`
  at build time. Unset, it shows an honest "not connected yet" state rather
  than a fake widget; set to a real Calendly event slug, it embeds the real
  scheduling iframe. (Switched from the originally-planned Cal.com when the
  user set up a Calendly link instead.)

## Provenance record

`src/app/layout.tsx` emits a hidden HTML comment (`PROVENANCE`) recording
this same substitution and source, the same way `apps/web`'s
`DIRECTION_CONTRACT` records its own — auditable in the shipped document,
not just in this file.
