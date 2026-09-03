import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const attendanceCorrectionManagerTour: TourDef = {
  id: "attendanceCorrectionManager",
  title: "Approve a shift-time correction",
  description: "Decide on a staff member's request to fix a missed punch.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  module: "attendance",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how a correction request reads before you decide — the reason is always shown first.",
  steps: [
    {
      anchor: TOUR_ANCHORS.attendanceRequests.pendingTab,
      title: "Requests waiting on you",
      body: "When a stylist forgets to clock in or out, they submit a correction from their own device — everything waiting on a decision lands here.",
      route: "/attendance/requests",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.attendanceRequests.requestCard,
      title: "Read before deciding",
      body: "Every request shows the original time next to what they're asking for, and the reason they gave — never just a bare time change.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.attendanceRequests.decisionButtons,
      title: "Approve or decline",
      body: "Approve writes the corrected time onto their attendance record for real. Decline asks for a note explaining why, which they'll see. This tour stops here so it doesn't decide a real request for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
