import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * The only tour that lives in the floor kiosk shell rather than the desk —
 * `toursForRoles` filtering by role alone keeps it isolated, since no other
 * tour lists STAFF among its roles.
 */
export const attendanceCorrectionStaffTour: TourDef = {
  id: "attendanceCorrectionStaff",
  title: "Fix a missed punch",
  description: "Ask your manager to correct a check-in or check-out.",
  roles: ["STAFF"],
  shell: "floor",
  module: "attendance",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how to ask for a correction — your manager decides, and you'll see the outcome under My requests.",
  steps: [
    {
      anchor: TOUR_ANCHORS.floorRequests.newButton,
      title: "Forgot to tap in or out?",
      body: "It happens. Tap + New to ask your manager to fix it — this doesn't change your record on its own.",
      route: "/floor/requests",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.floorRequestForm.dayField,
      title: "Which day",
      body: "Pick the day the punch was wrong or missing.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.floorRequestForm.timeFields,
      title: "The corrected time",
      body: "Set check-in, check-out, or both — whatever was actually wrong. Anything already on record is filled in for you.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.floorRequestForm.reasonField,
      title: "Say what happened",
      body: "A short reason — your manager sees this before deciding.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.floorRequestForm.sendButton,
      title: "Send it",
      body: "This sends the request to your manager for a real decision — this tour stops here so it doesn't send one for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
