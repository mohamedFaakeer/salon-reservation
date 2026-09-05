import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const bookingCancelTour: TourDef = {
  id: "bookingCancel",
  title: "Cancel a booking",
  description: "Cancel an appointment, with a reason on record.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how cancellation works, and where the reason ends up.",
  steps: [
    {
      anchor: TOUR_ANCHORS.appointments.openRowButton,
      title: "Open a booking",
      body: "Cancelling happens from the same detail panel as everything else — open any appointment that hasn't already finished or been cancelled.",
      route: "/appointments",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.actionCancel,
      title: "Cancel it",
      body: "This opens the cancellation panel — nothing is cancelled yet.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.cancelReasonField,
      title: "A reason is required",
      body: "This is kept on record — it's what shows up later if anyone asks why this booking was cancelled.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.confirmCancelButton,
      title: "This is the real cancel",
      body: "Clicking Confirm cancellation actually cancels the booking, and the slot it held opens back up. This tour stops here so it doesn't cancel a real booking for you — in real use, type a reason and click here.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
