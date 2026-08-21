# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two distinct audiences use this app, and until now only one had a surface.

**The desk** — owner, manager, receptionist. Desktop/tablet, seated, working the whole salon: today's board, bookings, payments, services, staff, reports. This is the existing app (`docs/PRD.md` §3.2 calls it "desktop/tablet-first" explicitly).

**The floor** — a stylist (STAFF role), on their own phone, standing up, between clients, often with wet or product-covered hands. Their job today is narrow ("see who I'm serving, when I'm free" per PRD §2) and this session is deliberately widening it: recording their own arrival and departure, seeing their own attendance history, and asking for a correction when a punch was missed. *(Inferred from this session's brief and the maintainer's own framing — "wet hands," "standing up," "one thing" — rather than a separate interview; flagged here for confirmation rather than re-asked.)*

A third role, the front desk (owner/manager/receptionist), also punches people in and out on the floor's behalf — the same reason `staff.userId` is nullable: not every stylist has a login.

## Product Purpose

A multi-tenant booking and salon-operations platform for unisex salons in Sri Lanka. This surface's slice of it: staff attendance (who was here, on time or not) and, on top of it, incentive pay — see `docs/DECISIONS.md` for the running log of scope decisions.

## Positioning

Not a generic HR/attendance product retrofitted onto a salon — attendance here is built from facts the booking system already has (the rota, the shift), so lateness is judged against the schedule the salon actually set, not a second copy of it kept somewhere else.

## Operating Context

- The desk app already has a committed visual world: teal-600 as brand, slate neutrals, system-ui, a named motion vocabulary in `globals.css`. New desk screens are refinement inside that world.
- The floor has no visual world yet. It is a genuinely different device class and posture from the desk (standing, one-handed, phone), so it is being treated as new surface — see `new-work`.
- Real usage scene: a punch happens in seconds, often while doing something else. The screen that asks for it must not compete for attention.
- "Missing check-out" is the common failure mode, not the exception — people leave without punching out far more than they forget to arrive. The design must treat it as an ordinary, one-tap-fixable state, never as an error state or a red flag.

## Capabilities and Constraints

- No native app — this is a web surface reached from a phone browser, likely added to the home screen, not distributed via an app store.
- Server time only: a punch is stamped by the server clock, never client-supplied — a phone with the wrong clock must not be able to forge an arrival time.
- Corrections never happen by editing a punch directly; they go through a request-and-approve flow with a required reason, decided by an owner or manager.
- Multi-tenant: everything here is scoped to the stylist's one salon, same as the rest of the app.

## Brand Commitments

Same salon, same product — no separate brand identity for "the floor" vs "the desk." The teal accent and the product's name carry over; what changes is density, input size, and posture, not identity.

## Evidence on Hand

No real stylist names, salon photography, or floor-device screenshots on hand. Attendance and rota data used in mockups should read as plausible Sri Lankan salon data (matching the existing demo-seed conventions in `apps/api/src/infrastructure/database/seed-demo.ts`), never lorem ipsum.

## Product Principles

1. A recorded fact always outranks a plan — someone who punched in on their day off was present, not "off," and the UI should never argue with that.
2. One motion per intent: arriving is one tap, leaving is one tap, everything else is secondary.
3. Never invent a time. A guess at when someone left is worse than an honest "missing check-out" state.
4. The floor is fast; the desk is thorough. Don't import the desk's density onto a screen meant to be used standing up.

## Accessibility & Inclusion

Large touch targets are a functional requirement here, not just a guideline — the primary gesture happens with hands that may be wet, gloved, or holding product. No requirement beyond the project's existing WCAG-AA baseline is known.
