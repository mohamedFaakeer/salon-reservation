import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const skillsMatrixTour: TourDef = {
  id: "skillsMatrix",
  title: "Assign skills",
  description: "Match stylists to the services they can perform.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've assigned a stylist's skills — the booking form will only offer them services they're checked off for here.",
  steps: [
    {
      anchor: TOUR_ANCHORS.staff.matrixTab,
      title: "Open the skills matrix",
      body: "This grid is the only place skills live — there's no separate skills list to maintain, just this table of who can do what.",
      route: "/staff",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.skillsMatrix.row,
      title: "Tick what they can do",
      body: "Check every service this stylist is qualified to perform. A stylist with nothing ticked can't be booked for anything — the app will flag that on their row.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.skillsMatrix.saveButton,
      title: "Save their row",
      body: "Each stylist's row saves independently — updating one person's skills never touches anyone else's.",
      placement: "left",
      advanceOn: "next-click",
    },
  ],
};
