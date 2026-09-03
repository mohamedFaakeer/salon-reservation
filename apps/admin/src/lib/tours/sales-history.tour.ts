import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const salesHistoryTour: TourDef = {
  id: "salesHistory",
  title: "Sales history & returns",
  description: "Every retail checkout, and how to process a return.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  module: "inventory",
  completionTitle: "Tour complete",
  completionMessage: "You've opened a past sale and seen where a return gets recorded.",
  steps: [
    {
      anchor: TOUR_ANCHORS.sales.searchField,
      title: "Every retail checkout",
      body: "Search by customer or product to find one — this is a record only, nothing here is charged.",
      route: "/sales",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.sales.rowLink,
      title: "Open a sale",
      body: "Open one to restock or quarantine a return.",
      placement: "bottom",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.saleDetail.itemsCard,
      title: "What was sold",
      body: "Every line, and how much of it has already been returned, if any.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.saleDetail.recordReturnButton,
      title: "This is the real Record return",
      body: "Restocks or quarantines the item depending on its condition, and can refund the customer. This tour stops here so it doesn't process a real return for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
