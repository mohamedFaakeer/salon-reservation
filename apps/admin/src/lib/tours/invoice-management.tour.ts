import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * The last three steps target mutually exclusive UI states (issued vs. not
 * yet issued) — whichever half doesn't apply to the appointment the user
 * opened is skipped automatically (`skipMissingElement`), so the tour covers
 * whichever side is actually relevant rather than assuming one.
 */
export const invoiceManagementTour: TourDef = {
  id: "invoiceManagement",
  title: "Manage an invoice",
  description: "Issue, view, and send the invoice for a booking.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  module: "invoices",
  completionTitle: "Tour complete",
  completionMessage: "You've seen where an invoice is issued, viewed, and sent from — always the booking itself.",
  steps: [
    {
      anchor: TOUR_ANCHORS.appointments.openRowButton,
      title: "Open a booking",
      body: "There's no separate invoices list — every invoice lives on the booking it belongs to.",
      route: "/appointments",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.invoicePanel.root,
      title: "The invoice panel",
      body: "Issue one, view it, print it, or email it — all from right here, below Payments.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.invoicePanel.issueButton,
      title: "Issuing creates the real document",
      body: "It gets a real, permanent invoice number the moment you issue it — this tour stops here so it doesn't create one for you.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.invoicePanel.viewButton,
      title: "View or print it",
      body: "Opens the actual document, any time, however many times you need to.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.invoicePanel.sendButton,
      title: "This is the real Send",
      body: "Clicking this actually emails the invoice to the customer — this tour stops here so it doesn't send a real email for you.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
