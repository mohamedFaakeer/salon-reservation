import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * Unlike every other tour, the three action steps here are real,
 * user-confirmed clicks (`advanceOn: "element-event"`), not narrate-only.
 * Check-in / start service / complete are routine, low-risk, everyday
 * operator actions — nothing financial or customer-facing-irreversible
 * about them — so this tour follows the pilot's own original intent
 * ("click Checked in, then In service, then Completed") rather than the
 * narrate-only handling reserved for cancel/refund/send-invoice.
 *
 * Only one of the three buttons is ever on screen at once (each is
 * conditionally rendered on the appointment's current status), so whichever
 * appointment the user opens, the step or steps that don't apply to its
 * current status are skipped — the tour picks up wherever that booking
 * actually is in its lifecycle.
 */
export const bookingStatusLifecycleTour: TourDef = {
  id: "bookingStatusLifecycle",
  title: "Checked in → In service → Completed",
  description: "Move a booking through its real-life stages.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've moved a booking through its stages — the status badge always reflects exactly where it is.",
  steps: [
    {
      anchor: TOUR_ANCHORS.appointments.openRowButton,
      title: "Open a booking that hasn't finished yet",
      body: "Pick one that's confirmed, checked in, or in service — anything that hasn't been completed, cancelled or marked a no-show.",
      route: "/appointments",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.statusBadge,
      title: "This badge is always the truth",
      body: "Every screen that shows this booking uses this exact same status. It only ever changes through the buttons below — never by editing it directly.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.actionCheckIn,
      title: "Check in",
      body: "Click this the moment the customer actually arrives.",
      placement: "top",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.actionInService,
      title: "Start service",
      body: "If you see this instead of a message about check-in, that just means this booking was already checked in — same idea. Click it once the stylist actually starts.",
      placement: "top",
      waitForAnchorMs: 6000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.actionComplete,
      title: "Complete",
      body: "The last stage — click this once the service is actually finished. From here it shows up in reports and can no longer be checked in or started again.",
      placement: "top",
      waitForAnchorMs: 6000,
      advanceOn: "element-event",
      eventType: "click",
    },
  ],
};
