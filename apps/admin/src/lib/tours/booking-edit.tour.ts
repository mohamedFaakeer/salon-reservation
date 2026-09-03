import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const bookingEditTour: TourDef = {
  id: "bookingEdit",
  title: "Edit a booking",
  description: "Add a service or change the time on an existing appointment.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've seen how to add a service and reschedule an existing booking.",
  steps: [
    {
      anchor: TOUR_ANCHORS.appointments.openRowButton,
      title: "Open a booking",
      body: "Click any appointment's date to open it. Every edit, from adding a service to rescheduling, happens in this same detail panel.",
      route: "/appointments",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.showAddServiceButton,
      title: "Add a service",
      body: "Click this to add another service to the booking without starting over.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.addServiceOption,
      title: "Pick what to add",
      body: "Tap a service to select it — the total updates as you go.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.submitAddServiceButton,
      title: "This is the real Add",
      body: "Clicking this actually adds the service to the booking — this tour stops here so it doesn't change a real appointment for you.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.actionReschedule,
      title: "Change the time",
      body: "Click Reschedule to open a fresh date and time picker for this same booking.",
      placement: "top",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.appointmentDetail.rescheduleSlotOption,
      title: "One click reschedules it",
      body: "There's no separate confirm step — clicking an open time here reschedules the booking immediately. This tour stops short of actually doing it.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
  ],
};
