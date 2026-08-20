# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a customer in Colombo, roughly 20–35, booking a salon
appointment on a phone, usually on mobile data. They already use PickMe and food
delivery daily and carry those expectations into this: instant, obvious, no
sign-up ritual. They book with no account at all — a phone number and a booking
reference are the entire identity mechanism.

A second audience evaluates this surface without ever booking: the salon owner
being shown the product as a demo. They are deciding whether this is software
worth paying for, and they judge it in about a minute.

## Product Purpose

Let a customer see a salon's genuinely open appointment slots and claim one in
under sixty seconds, from a link, with no account. Success is a booked
appointment that appears on the salon's day board without anyone phoning anyone.

## Positioning

Every slot shown is real. The times come from one server-side availability
engine that reads the stylist's actual rota, their leave, salon closures, the
services they are qualified for, and every appointment already in the book —
then the database itself prevents a double booking with an exclusion constraint.
Competitors show a full grid with unavailable times greyed out; this shows only
what can actually be booked, and a slot on screen can be taken.

## Operating Context

The customer arrives from a link the salon shares, browses on a phone one-handed,
often standing up, and decides between a few salons. Booking is competitive: a
slot can be taken by someone else while they are still deciding, so a ten-minute
hold protects the slot during checkout, and it visibly expires.

The salon side runs the same appointment from an admin app on a desktop or
tablet at reception. Walk-ins, phone bookings and online bookings all become the
same record through the same engine.

## Capabilities and Constraints

- Seven-step booking flow: services → stylist → date → slot → details → payment → confirmation.
  The payment step is skipped entirely when the salon requires no deposit.
- "Any available stylist" is the default; choosing a specific stylist re-runs availability.
- Ten-minute slot hold during checkout, enforced server-side, surfaced as a countdown.
- Manage a booking with reference code + phone: view, reschedule, cancel.
  Self-service cancellation is bounded by a per-salon cutoff; past it, the copy
  must say to call the salon.
- Money is Sri Lankan rupees, displayed as `Rs. 2,500`.
- Times are Asia/Colombo. Dates are `YYYY-MM-DD` on the wire.
- Prices and durations are snapshotted at booking; later salon price changes
  never alter an existing appointment.
- Payment is record-only in this version. There is no real gateway, and the UI
  must not imply a card is being charged.
- Multi-tenant: one deployment serves many salons, each at `/salon/<slug>`.

## Brand Commitments

- **Teal is committed.** The existing teal accent is a real decision and must
  survive any visual redesign.
- No logo, wordmark, or typeface has been committed. The product has no name
  beyond "Salon" placeholder text.

## Evidence on Hand

- A live deployment with one real tenant, "Eagle", seeded with ten real services
  (Rs. 600 Beard Trim through Rs. 12,000 Bridal Makeup), four stylists — Ishara,
  Kasun, Nadeesha, Tharushi — real weekly rotas, and sample appointments booked
  through the real engine.
- No photography of any kind exists in the repository. No customer testimonials,
  no reviews, no ratings, no usage numbers. None of these may be invented:
  a fabricated "4.9 from 10k happy clients" is exactly the claim this product
  cannot make.
- API returns a per-salon `advanceRuleLabel` and `cancellationPolicySummary` as
  ready-made customer-facing sentences; the UI must display these rather than
  compose its own version of the policy.

## Product Principles

1. **Never show a slot that cannot be booked.** An empty day is honest; a fake
   grid of greyed-out times is not.
2. **No account, ever.** The reference code is the credential. Nothing in the
   flow may ask a customer to register.
3. **The server owns every number.** Prices, availability, deposits and refunds
   are displayed as received, never recomputed in the browser.
4. **The booking reference is the artifact the customer leaves with.** It must be
   impossible to miss, easy to read aloud over the phone, and easy to keep.
5. **Speed is the feature.** Sixty seconds from link to booked, on mobile data.

## Accessibility & Inclusion

WCAG AA is required: 4.5:1 text contrast, 44×44px minimum touch targets, visible
keyboard focus, and full `prefers-reduced-motion` support. The flow is used
one-handed on a phone, frequently in bright outdoor light.
