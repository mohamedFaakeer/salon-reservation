import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * The last two steps open an existing product row (`products.rowLink`)
 * rather than chaining off the just-created one — real creation is
 * narrate-only here (see `productDrawer.submitButton`), so a product only
 * actually exists to open if the tenant already has one on file.
 */
export const productManagementTour: TourDef = {
  id: "productManagement",
  title: "Set up products",
  description: "Add a product to the catalog and give it a sellable variant.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  module: "inventory",
  completionTitle: "Tour complete",
  completionMessage: "You've created a product and seen where its variants (the things actually sold) get added.",
  steps: [
    {
      anchor: TOUR_ANCHORS.products.createButton,
      title: "Create a product",
      body: "This is the catalog entry — the specific sellable version (a size, a shade) comes next, as a variant.",
      route: "/products",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.productDrawer.nameField,
      title: "Name it",
      body: "Category and brand are both optional, just below.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.productDrawer.trackingFields,
      title: "Does it expire, or need a serial?",
      body: "Turn these on only if they actually apply — cosmetics might track expiry, a hair dryer might track serial numbers. Most products need neither.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.productDrawer.submitButton,
      title: "This is the real Create",
      body: "Saving opens straight into adding its first variant — this tour stops here so it doesn't create a real product for you.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.products.rowLink,
      title: "Open any product",
      body: "This is where variants — the actual SKUs customers buy — get added and edited.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.productDetailDrawer.variantFields,
      title: "SKU and price",
      body: "The SKU and barcode are what Quick Sale and a barcode scanner both look for. Opening stock is optional here — skip it and use Receive stock instead.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.productDetailDrawer.addVariantButton,
      title: "This is the real Add",
      body: "This tour stops here so it doesn't add a real variant to a real product for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
