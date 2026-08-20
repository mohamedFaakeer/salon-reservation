# Design — Wax-Resist

The visual world of `apps/web`, the customer booking site. Written from the
built result, not ahead of it.

Seed `9ab4fc5d`. The direction contract ships as an HTML comment at the top of
every page's `<body>`; grep the running site for `9ab4fc5d` to read it.

## The idea

Sri Lankan batik, as a mechanism rather than a motif. Cloth goes into the dye
bath; wax decides where colour lands; the crackle is where the wax broke and
colour got in, and it is never twice the same. That maps onto the product: the
salon's open hours are the dyed field, a booking is where the dye takes, and the
reference code is the mark the customer leaves with.

This refuses two arrangements on purpose — the category's white cards with a
teal button, and the warm-cream-with-terracotta spa page that is the default
output for this brief.

## The legend

Colour is a strict language here, not a palette. Every colour means exactly one
thing, and a colour used for a second purpose has broken the system.

| Token | Value | Means |
|---|---|---|
| `--dye` | `#0FA396` | **Bookable.** The committed brand teal. Nothing else may use it. |
| `--dye-deep` | `#04211F` | The ground — cloth left in the bath |
| `--dye-mid` | `#0B3B37` | Ground one step up, for surfaces on the ground |
| `--bloom` | `#7BE3D0` | Where dye thins: secondary text *on* dye |
| `--indigo` | `#2E3A8C` | The **second bath**. Overlap only — this is "selected" |
| `--resist` | `#F0E7D6` | Undyed cloth: type, negative space, crackle |
| `--resist-dim` | `#B9AE9A` | Secondary text on the dyed ground |
| `--ink` | `#12302C` | Type on undyed cloth |
| `--alarm` | `#E0A33C` | The only non-legend hue, one job: **the hold is about to expire** |

Teal is a recorded brand commitment (see `PRODUCT.md`). It survived a full
direction round precisely because it is load-bearing.

### Two grounds, no third

Every surface is either in the bath or out of it — `<Dyed>` or `<Undyed>` in
`components/cloth.tsx`. Keeping them as components rather than utility strings
is what stops an accidental third ground appearing halfway through the flow.
Reading-heavy surfaces (the service list, the form) are undyed; atmosphere-heavy
ones (home, the salon hero, confirmation) stay in the dye.

## Type

- **Display — Anybody.** A variable face whose width axis is the point: it goes
  wide, like a stamp pressed into cloth. Used uppercase at `wdth 122 / wght 800`,
  or `132 / 900` for the widest moments. `.display` / `.display-wide`.
- **Body — Familjen Grotesk**, 400–700.
- Both are self-hosted through `next/font`, so there is no third-party font
  request and no flash of fallback text on a cold instance.

Deliberately *not* Playfair, Outfit, Space Grotesk, DM Sans, or Inter-as-display.
The design database recommended Playfair; it was overridden because that pairing
is a signal the face was picked by a model rather than for this subject.

## Photography

Every image is desaturated and composited under the dye (`<DyedPhoto>`), so a
replacement photo cannot arrive in colours that break the world. Sources and the
honest note that these are stock placeholders live in `public/img/CREDITS.md`;
`lib/imagery.ts` is the single place paths are named.

Stylist portraits fall back to drawn initials rather than a broken frame.

## Motion

One authored moment per screen, never the same entrance on every section.
Everything animates from an already-visible default, so a failed animation
leaves readable content rather than a blank page.

| Where | What |
|---|---|
| Salon hero | The name **soaks in** left-to-right via `clip-path` — the one authored moment |
| Salon photo | Slow scale from 1.06 → 1 on load |
| Salon cards, slots | Rise + fade, 40–70ms stagger |
| Confirmation seal | Blooms once, then stops |
| Wizard steps | Each step rises on entry, keyed on step |
| Crackle | **Static by contract.** The moment it animates it becomes a screensaver |

Durations: `--t-tap` 140ms, `--t-state` 240ms, `--t-bloom` 320ms, easing
`cubic-bezier(0.16, 1, 0.3, 1)`. `prefers-reduced-motion` collapses all of it —
except the spinner, because a spinner frozen mid-rotation reads as a hung
request.

## Rules the build holds itself to

1. **One lit element per screen.** The glow *is* the state. This is what makes
   selection readable at arm's length in Sri Lankan sunlight. On the time step
   the soonest slot is lifted out of the grid into its own lit panel.
2. **No eyebrow above a heading.** `<Marker>` labels its own object — never sits
   above a heading as a decorative kicker.
3. **Skeletons hold the exact final grid.** `SlotsSkeleton` reserves the lit
   panel's box and the 3-column grid, so nothing shifts when slots land.
4. **The hold has three states, not one number.** Held, running out, expired —
   each says something different and offers a different action.
5. **Browser surfaces are themed.** Selection, caret, focus ring, scrollbar,
   `accent-color`, and tabular figures all come from the palette.
6. **Ground-agnostic components take `currentColor`.** `EmptyState` renders on
   both grounds; naming one palette there is how it ends up washed out on the
   other.

## Where it does not reach

- The admin app (`apps/admin`) is a different surface in Operate mode and keeps
  its own system. This world is the customer site only.
- The stylist portraits are stock and are not the named stylists. A real salon
  replaces all seven images and changes nothing else.
