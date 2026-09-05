import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const quickSaleTour: TourDef = {
  id: "quickSale",
  title: "Ring up a retail sale",
  description: "The counter checkout, for anything that isn't a booking.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  module: "inventory",
  completionTitle: "Tour complete",
  completionMessage: "You've built a cart, attached a customer, and seen where charging actually happens.",
  steps: [
    {
      anchor: TOUR_ANCHORS.quickSale.searchField,
      title: "Find or scan an item",
      body: "Type a name or SKU, or scan a barcode — a USB or Bluetooth scanner just types straight into this field. Not in the catalog yet? Custom item sells it right away and can be added to the catalog properly afterward.",
      route: "/quick-sale",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.quickSale.productTile,
      title: "Tap to add it",
      body: "Tapping an item adds it to the cart on the right — nothing is charged yet.",
      placement: "right",
      waitForAnchorMs: 5000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.quickSale.attachCustomerButton,
      title: "Attach a customer (optional)",
      body: "Defaults to a walk-in. Attach one if you want this sale on their history.",
      placement: "left",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.quickSale.chargeOpenButton,
      title: "Charge",
      body: "Opens once there's at least one item in the cart.",
      placement: "top",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.quickSale.chargeMethodOption,
      title: "How they're paying",
      body: "Cash, card, or bank transfer.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.quickSale.chargeConfirmButton,
      title: "This is the real Charge",
      body: "This tour stops here so it doesn't take a real payment for you. In real use, this both charges the customer and deducts stock immediately.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
