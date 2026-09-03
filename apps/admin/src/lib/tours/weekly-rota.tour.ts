import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const weeklyRotaTour: TourDef = {
  id: "weeklyRota",
  title: "Set the weekly rota",
  description: "Give each stylist bookable hours.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've set a stylist's hours for one day — repeat per day, per stylist, to build out the whole week.",
  steps: [
    {
      anchor: TOUR_ANCHORS.availability.rotaTab,
      title: "The weekly rota",
      body: "Every stylist, every day of the week, at a glance. A day with nothing set here simply isn't bookable.",
      route: "/availability",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.availability.rotaCell,
      title: "Click a day to set it",
      body: "Click any stylist's cell for any weekday to set their working hours for that day.",
      placement: "right",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.scheduleDrawer.hoursFields,
      title: "Start and end time, and a break",
      body: "Changing these never moves a booking already made outside the new hours — it only changes what opens up going forward.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.scheduleDrawer.saveButton,
      title: "Save the hours",
      body: "That day is now bookable for this stylist. Clear a day's hours entirely and it goes back to not worked, rather than storing an empty shift.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
