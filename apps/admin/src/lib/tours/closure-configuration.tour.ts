import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const closureConfigurationTour: TourDef = {
  id: "closureConfiguration",
  title: "Set up a salon closure",
  description: "Block bookings salon-wide for a holiday or shutdown.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've added a salon-wide closure — it blocks new bookings across every stylist for those dates.",
  steps: [
    {
      anchor: TOUR_ANCHORS.availability.closuresTab,
      title: "Closures",
      body: "Different from leave: a closure applies to everyone, not one stylist — a public holiday, a refurbishment, a day the whole salon is shut.",
      route: "/availability",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.availability.addClosureButton,
      title: "Add a closure",
      body: "Click here to block bookings across the whole salon for a date range.",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.closureDrawer.nameField,
      title: "Name it",
      body: "Something staff will recognize on the calendar — \"New Year\", \"Renovation\", whatever fits.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.closureDrawer.datesField,
      title: "The dates",
      body: "Anything already booked in this period isn't cancelled automatically — you'll still need to contact those customers yourself.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.closureDrawer.saveButton,
      title: "Save it",
      body: "Done — no stylist can be booked on those dates until the closure is removed.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
