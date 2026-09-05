import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const paymentRecordingTour: TourDef = {
  id: "paymentRecording",
  title: "Record a payment",
  description: "Take cash, card, bank transfer, or a gift card or package credit.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how to record a payment — refunds work the same way, from the same booking.",
  steps: [
    {
      anchor: TOUR_ANCHORS.appointments.openRowButton,
      title: "Open a booking with a balance due",
      body: "Payments are recorded from the same detail panel as everything else.",
      route: "/appointments",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.showRecordPaymentButton,
      title: "Record payment",
      body: "This only shows up when there's a balance still owed on the booking.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.recordPaymentAmountField,
      title: "The amount",
      body: "For cash, this is what the customer physically hands over — the app works out the change due for you.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.recordPaymentMethodField,
      title: "How they paid",
      body: "Cash, bank transfer, a card already captured elsewhere, a gift card, or a prepaid package credit.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.recordPaymentTypeField,
      title: "What it's for",
      body: "An advance taken up front, the full amount, or the remaining balance.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.submitRecordPaymentButton,
      title: "This is the real Record",
      body: "Clicking this actually records the payment against the booking — this tour stops here so it doesn't record real money for you. A refund, if one's ever needed, is issued from this same booking, not from the separate Payments list.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
