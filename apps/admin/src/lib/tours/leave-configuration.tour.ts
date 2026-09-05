import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const leaveConfigurationTour: TourDef = {
  id: "leaveConfiguration",
  title: "Book time off",
  description: "Take a stylist off the rota for a date range.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've booked time off for a stylist and seen how the app warns you about existing bookings without touching them.",
  steps: [
    {
      anchor: TOUR_ANCHORS.availability.leaveTab,
      title: "Leave",
      body: "Every upcoming, in-progress, and past leave period for the whole team, in one list.",
      route: "/availability",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.availability.addLeaveButton,
      title: "Add leave",
      body: "Click here to take a stylist off the rota for a date range — a holiday, an appointment, anything.",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.leaveDrawer.staffField,
      title: "Who, and when",
      body: "Pick the stylist and the date range they'll be away.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.leaveDrawer.datesField,
      title: "It checks for you",
      body: "Before you save, it lists any appointment already booked in that period — so you know who to call before you commit.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.leaveDrawer.saveButton,
      title: "Save it",
      body: "Adding leave never cancels a booking on its own — any collision it warned you about still needs a phone call.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
