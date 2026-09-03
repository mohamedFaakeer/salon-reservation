/**
 * Interactive product tours — content shape.
 *
 * Authored as typed code (one file per tour, see `booking-create.tour.ts`),
 * not as CMS/DB content. Tour copy is tightly coupled to real DOM structure,
 * and this codebase's own discipline (strict TS, tests green before commit)
 * is what catches a renamed anchor before it ships — a CMS-editable tour
 * would bypass all of that and could silently point at nothing in production.
 */

export type TourRole = "OWNER" | "MANAGER" | "RECEPTIONIST" | "STAFF";

export interface TourStepDef {
  /** A value from `TOUR_ANCHORS` — the element this step highlights. */
  anchor: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
  /** Navigate here before showing this step, if not already on that route. */
  route?: string;
  /**
   * How long to wait for this step's anchor to appear before giving up on it
   * (e.g. after navigating, or after the previous step's real click opens a
   * drawer). Skipping just this one step is always the failure mode — never
   * aborting the whole tour on one missing anchor.
   */
  waitForAnchorMs?: number;
  /**
   * "next-click": the step has a visible Next button — a narration step, not
   * one where finishing requires a specific real action.
   *
   * "element-event": the step advances only when the user actually performs
   * the described action on the anchor itself (e.g. clicking "New booking").
   * No Next button is shown; the tour narrates, then waits for the real
   * thing to happen, matching the product's "click-by-click" intent instead
   * of auto-playing a fake action for the user.
   */
  advanceOn: "next-click" | "element-event";
  /** Required when `advanceOn` is "element-event" — the DOM event to listen for. */
  eventType?: keyof HTMLElementEventMap;
}

export interface TourDef {
  id: string;
  title: string;
  description: string;
  roles: TourRole[];
  shell: "app" | "floor";
  steps: TourStepDef[];
  /** Shown as a success toast the moment the tour is actually finished (not on skip) — the same confirmation pattern the rest of the app uses for a completed action, so a tour ending reads as clearly "done" as any other. */
  completionTitle: string;
  completionMessage: string;
}
