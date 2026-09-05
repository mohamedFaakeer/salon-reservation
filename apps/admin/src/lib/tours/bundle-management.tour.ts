import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const bundleManagementTour: TourDef = {
  id: "bundleManagement",
  title: "Create a bundle",
  description: "Sell a kit as one line, priced however you like.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  module: "inventory",
  completionTitle: "Tour complete",
  completionMessage: "You've built a bundle — availability is always computed live from what's actually in stock, never stored.",
  steps: [
    {
      anchor: TOUR_ANCHORS.bundles.createButton,
      title: "Create a bundle",
      body: "A bundle is a kit — several existing products sold together as one line, at one price.",
      route: "/bundles",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.bundleDrawer.nameField,
      title: "Name and price",
      body: "The bundle's own price — whether it's worth more or less than the sum of its parts is entirely your call.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bundleDrawer.componentPicker,
      title: "Add what's inside",
      body: "Search or scan for each product that makes up the kit, and set how many of each one goes in.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bundleDrawer.submitButton,
      title: "This is the real Create",
      body: "This tour stops here so it doesn't create a real bundle for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
