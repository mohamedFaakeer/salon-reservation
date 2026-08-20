/**
 * Bundled photography, in one place so replacing it is a single edit.
 *
 * These are Unsplash placeholders (see public/img/CREDITS.md). A real salon
 * replaces the files and changes nothing else. Every image is treated the same
 * way on screen — desaturated and dyed into the palette — so a swapped photo
 * cannot break the world by arriving in the wrong colours.
 */

export const SALON_SCENES = [
  "/img/salon-interior.jpg",
  "/img/salon-chair.jpg",
  "/img/salon-styling.jpg",
] as const;

const STYLIST_PORTRAITS = [
  "/img/stylist-1.jpg",
  "/img/stylist-2.jpg",
  "/img/stylist-3.jpg",
  "/img/stylist-4.jpg",
] as const;

/** Stable per id, so a stylist keeps the same face between renders. */
export function portraitFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return STYLIST_PORTRAITS[hash % STYLIST_PORTRAITS.length];
}

export function sceneFor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return SALON_SCENES[hash % SALON_SCENES.length];
}

/** Initials for a stylist with no portrait — never a broken image. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
