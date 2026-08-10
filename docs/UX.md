# UX.md — UX/UI Design Specifications

**Design language:** Clean, modern SaaS. Tailwind CSS 4. No unnecessary animations. Consistent components. Explicit empty / loading / error states everywhere. Customer = mobile-first; staff = desktop/tablet-first.

---

## 1. Design Tokens & Theme

- **Neutral palette:** slate (backgrounds `#F8FAFC`, surfaces white, borders `#E2E8F0`, text `#0F172A` / secondary `#64748B`).
- **Primary:** teal `#0D9488` (trust, calm) with hover `#0F766E`.
- **Semantic status colors:**
  - `PENDING_PAYMENT` — amber `#F59E0B`
  - `CONFIRMED` — blue `#3B82F6`
  - `CHECKED_IN` — emerald `#10B981`
  - `IN_SERVICE` — violet `#8B5CF6`
  - `COMPLETED` — slate `#64748B`
  - `CANCELLED` — red `#EF4444`
  - `NO_SHOW` — neutral-400 `#9CA3AF`
  - `EXPIRED` — orange `#F97316`
  - `RESCHEDULED` — sky `#0EA5E9`
- **Payment states:** PENDING amber · SUCCESS emerald · FAILED red · REFUNDED slate · PARTIALLY_REFUNDED violet · REQUIRES_RECONCILIATION orange.
- **Spacing scale:** Tailwind defaults (4px base). Radius: `rounded-lg` (components), `rounded-2xl` (cards on mobile).
- **Typography:** Inter (system font stack fallback). Customer: large tap targets. Staff: dense but legible (13–14px labels, 16px+ numbers).
- **Icons:** lucide-react (small, consistent 16–24px).

---

## 2. Component System

Shared components across both apps (in `apps/web` and `apps/admin` independently, or a future shared package; MVP keeps them local for speed):

| Component | Purpose | States |
|---|---|---|
| `Button` | Primary / secondary / danger / ghost | loading (spinner), disabled |
| `Card` | Containers | hover, selected |
| `Badge` | Status + payment pills | per-status color |
| `EmptyState` | No data | icon + title + hint + optional CTA |
| `ErrorState` | Backend errors / offline | code + message + retry |
| `Skeleton` | Loading placeholders | shimmer/pulse |
| `Modal` / `ConfirmDialog` | Destructive confirmations | danger theme |
| `SlotPicker` | Time slots grid | available / booked / selected / disabled |
| `DatePicker` | Date selection | disabled days, min/max |
| `StaffPicker` | Staff or "Any Available Staff" | qualified only, disabled otherwise |
| `ServicePicker` | Multi-select services | with price+duration chips |
| `DayCalendar` (admin) | Day schedule | time axis + staff columns + overlap handling |
| `BookingDrawer` (admin) | Quick booking from calendar | inline form, engine-backed |
| `PaymentSheet` (admin) | Record payment/refund | amount validation, idempotency key auto |
| `CustomerSearch` (admin) | Search w/ duplicate flagging | existing-customer hint |

**Rules:**
- Every async action shows a loading state; optimistic UI only where safe (e.g. slot selection — but never for creation).
- Destructive actions (cancel appointment, remove service, delete staff) always use `ConfirmDialog` with the consequence spelled out ("Refund of Rs. 1,000 will be issued to the customer").
- Every empty list has an `EmptyState` with a next action.
- Every API error surfaces as `ErrorState` or inline field error with the server's actionable message (never "Something went wrong"; API.md §7).

---

## 3. Customer App (apps/web) — Mobile-First

### 3.1 Flow map (min steps)

```
Home → Salon list → Salon profile
        → Services (multi-select) → Staff ("Any Available Staff" default)
        → Date → Slots (engine) → Summary & details (name+phone+email)
        → Advance notice → Confirm → Held/Payment → Success (booking reference)
        → Back: Manage booking via reference (reschedule / cancel)
```

### 3.2 Screens

| Screen | Key elements | Notes |
|---|---|---|
| **Home** | Search box, featured salons, "Book now" CTA | Search = name/city; SSR fast |
| **Salon list** | Cards: name, city, first 3 services, price-from | Sorted by proximity (later) / most booked |
| **Salon profile** | Hero (name/slug/address), services grid, staff grid (headshots/initials + specialties), hours, closure notice (e.g. "Closed Dec 25"), advance + cancellation policy callout | Select services → continues to booking |
| **Service picker** | Checkboxes/chips with name, price, duration; live total duration + price bar; note if staff cannot perform a service be disabled | Multi-select allowed |
| **Staff picker** | "Any Available Staff" (default, highlighted) then individual staff with "not qualified for selection" states | Choosing a specific staff re-runs availability |
| **Date picker** | Next 30 days (window); disabled past days + closed days + days below lead time (same-day disabled after 2h cutoff) | Date change re-queries slots |
| **Slot picker** | Grid of slots: earliest highlighted ("Fastest available — 10:00 AM"); each chip shows time + staff name; booked slots are hidden (only open ones shown) | Engine-driven; no "show all" fake grid |
| **Summary** | Service list w/ prices+durations, staff, date/time, ETA end, subtotal, advance required + method note, balance due, cancellation policy, notes | Clear + trustworthy |
| **Customer details** | Name, phone (validation), optional email, notes; no account creation | Minimal fields |
| **Payment step** | Advance notice ("Rs. 1,000 advance required to confirm") + "Book — pay advance" button; in MVP: simulated manual confirmation with clear copy "(demo) Payment will be recorded by the salon"; if NO_ADVANCE: straight to Confirmation | Holding status shows countdown ("Slot held for 9:41") |
| **Success** | Big check, booking reference `ELN-7F3K2`, summary, "Add to calendar" (optional), note about SMS/email confirmation | Reference prominent — customer must retain it |
| **Manage booking** | Enter reference + phone → view details, reschedule (re-runs flow), cancel (policy + refund shown) | Self-service within 2h cutoff, otherwise "Please call the salon" |

### 3.3 Constraints & UX rules

- No login wall: browse → select → book → authenticate only when necessary (here: never; reference is the auth).
- Every slot displayed is **genuinely available** (engine query) — never present a fake full grid with disabled states for "booked" slots; hide unavailable slots and show clear empty state when nothing is left: "No slots left on this day — try another date or staff."
- Late-arrival / no-show policies shown at booking time.
- Mobile bottom sticky bar during service/staff/date/slot steps: "Continue" with running summary (services count + total).
- Loading skeletons while slots fetch; error state with retry on failure.

---

## 4. Admin/Staff App (apps/admin) — Desktop/Tablet-First

### 4.1 Navigation (sidebar)

- **Today** (default) — day calendar + quick actions
- **Schedule** — date-picker day/week view (day = MVP)
- **Appointments** — filterable list
- **Customers** — search/list/history
- **Services** — CRUD + categories
- **Staff** — CRUD + staff-service assignment
- **Availability** — working schedules, breaks, leave, closures
- **Settings** — advance rule, cancellation policy, booking window, grace, reminders
- **Payments** — recent payments, outstanding balances, refunds
- **Notifications** — delivery log + retry
- **Audit** — (manager/owner) audit trail

### 4.2 Key screens

| Screen | Key elements | Behavior |
|---|---|---|
| **Today** | Status summary cards (check-ins, waiting, in service, expected revenue, outstanding, cancellations, no-shows) + day calendar + quick actions (New booking, Walk-in, Check in, Record payment) | Bottom-up: operator can act from one screen |
| **Day calendar** | Time rows (start-time based); staff columns; each appointment card shows customer, services, staff color, status badge, payment state; overlap handled by compact cells | Click card → detail drawer with all actions |
| **Booking drawer** | Customer search/create (duplicate warn), services multi-select, staff (qualified only), date+time via engine slots, source select (`RECEPTIONIST / WALK_IN / PHONE / WHATSAPP`), optional "check in immediately", notes | Single drawer, no multi-page wizard; live slot validation |
| **Appointment detail** | Timeline (created → paid → checked-in → in service → completed), services incl. snapshots, payment panel (record advance/full, refund with policy), customer card w/ history, audit | All actions in one place |
| **Check-in / late** | On check-in, if `lateMinutes > grace`: banner "LATE — 20 minutes"; action buttons: Continue / Shorten (trims duration + price via server) / Reschedule / Cancel | Staff decide; nothing auto-destroyed |
| **Customer search** | Typeahead by name/phone; "Existing customer found." callout; new customer requires confirm; duplicate conflict shows existing profile w/ merge button (explicit) | No silent dupes/merges |
| **Services admin** | Table w/ name, category, duration, price, active; edit price/duration → confirm dialog: "Existing bookings keep current prices and durations. New bookings use the new value." + audit | Snapshot guarantee |
| **Staff admin** | Staff list + availability tab (weekly schedule incl. breaks) + leave tab (create leave → "N appointments affected" panel: reassign / reschedule / cancel per appointment) + staff-service assignment checkboxes | Per spec §24 workflow |
| **Settings** | Toggle advance rule (radio), value fields, cancellation policy thresholds, booking window, same-day lead minutes, no-show grace, reminder offsets | Saved via PATCH `/settings` |
| **Payments** | List w/ state filters; record payment modal (amount auto-filled from balance, method, type); refund flow with policy-computed amount (read-only + reason + confirm) | Idempotency key auto-attached, retried safely |
| **Notifications** | Per appointment/channel rows w/ `SENT / FAILED / PENDING` + retry button | Failure never touches appointment |

### 4.3 Admin UX rules

- Actions on the today screen reachable in ≤2 clicks from a calendar row.
- Dense tables with sticky headers; row actions reveal on hover (desktop) and always visible on touch.
- Every mutation returns server "what happened + next step" messaging (API.md §7).
- Permission-aware: buttons not permitted for a role are hidden **and** server-rejected (frontend hiding = convenience; SECURITY.md §3).
- No page reloads for inline actions (add service, record payment, change status) — API + refetch, loading states on buttons.
- Print-friendly "Daily schedule" view for receptionists who want paper (nice-to-have, low cost).

---

## 5. Responsive Behavior

- **Customer:** single column, bottom sticky action bar, thumb-friendly targets ≥44px.
- **Admin:** ≥1024px = full calendar + sidebar; <1024px = stack to single column, sidebar collapses to drawer, calendar switches to staff-filtered list; touch optimization for tablets.
- Both apps: consistent spacing scale, no horizontal scroll on mobile, focus states visible for keyboard/accessibility.

---

## 6. Accessibility Baseline

- Contrast ≥ WCAG AA (teal on white = 4.5:1 thresholds met with darker teal for text).
- All interactive elements keyboard-focusable with visible focus rings.
- Status conveyed by color **and** text label (badges include labels, not only color).
- Form fields have labels; errors linked via `aria-describedby`.
- `prefers-reduced-motion` respected (no animations anyway).

---

## 7. Empty / Loading / Error State Standards

| Scenario | Component |
|---|---|
| No appointments today (admin) | `EmptyState` "No appointments today — here's what's next" + Quick actions |
| No slots (customer, a date) | `EmptyState` "No open slots on {date} — pick another date or staff" |
| Search finds nothing | `EmptyState` "No customers match '{query}'" + CTA "Create customer" |
| Loading slots / schedules | `Skeleton` rows |
| API failure | `ErrorState` with code + server message + retry |
| Slot just taken | Inline banner: "That slot was just booked by another customer. Pick another time." + slot grid refresh |
| Payment failure | Step-level error with next action (retry, choose another slot, call salon) |

---

## 8. Copy Guidelines

- Actionable, friendly, Colombo-friendly English (Sinhala/Tamil localization is a documented **future** enhancement — strings centralized in `packages/shared` i18n seed to enable it cleanly).
- Booking confirmation must include: salon, services, staff, date/time, advance paid, balance, **booking reference**, cancellation policy, salon phone.
- Reminder: "Reminder: {salon} · {service} · Tomorrow at {time} with {staff}." — reservation code included.
- Every error message: what happened + what to do. Never "Something went wrong."