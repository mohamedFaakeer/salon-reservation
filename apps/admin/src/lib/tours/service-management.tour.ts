import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const serviceManagementTour: TourDef = {
  id: "serviceManagement",
  title: "Set up your services",
  description: "Add, edit and retire what your salon sells.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've added a service and seen how retiring works — nothing here is ever hard-deleted.",
  steps: [
    {
      anchor: TOUR_ANCHORS.services.newServiceButton,
      title: "Add what you sell",
      body: "Every booking starts with a service. Click New service to add the first thing your salon offers.",
      route: "/services",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.serviceDrawer.nameField,
      title: "Name it",
      body: "Use a name your customers and staff will both recognize — this is what shows up on the booking form and every appointment made with it.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.serviceDrawer.durationPriceFields,
      title: "Set duration and price",
      body: "Duration blocks the calendar; price is what's charged. If you change either later, appointments already booked keep the values they were booked at.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.serviceDrawer.saveButton,
      title: "Save it",
      body: "That's a bookable service, ready to appear on the booking form.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.services.toggleServiceButton,
      title: "Retire, don't delete",
      body: "Nothing here is ever hard-deleted. Retiring a service hides it from new bookings but keeps it exactly as it was on every past appointment — restore it any time with the same button.",
      placement: "left",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
  ],
};
