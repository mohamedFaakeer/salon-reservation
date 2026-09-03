import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const stockManagementTour: TourDef = {
  id: "stockManagement",
  title: "Manage stock",
  description: "Receive a delivery, and fix a count when it's wrong.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  module: "inventory",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how to receive stock and adjust a count — both keep a real record of what changed and why.",
  steps: [
    {
      anchor: TOUR_ANCHORS.stock.receiveButton,
      title: "Receive stock",
      body: "Use this every time a delivery comes in — it can cover several products and batches in one go.",
      route: "/stock",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.stockReceiveDrawer.batchRow,
      title: "One batch per line",
      body: "Pick the variant, how many arrived, and what they cost — add another line below for a different product in the same delivery.",
      placement: "right",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.stockReceiveDrawer.submitButton,
      title: "This is the real Receive",
      body: "This tour stops here so it doesn't add real stock for you.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.stock.adjustButton,
      title: "Fix a count",
      body: "For everything that isn't a delivery — breakage, a stock take that doesn't match, a sample given away.",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.stockAdjustDrawer.directionField,
      title: "Add or remove",
      body: "A reason is required either way — this becomes part of the permanent stock history for that variant.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.stockAdjustDrawer.submitButton,
      title: "This is the real Save",
      body: "This tour stops here so it doesn't change a real count for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
