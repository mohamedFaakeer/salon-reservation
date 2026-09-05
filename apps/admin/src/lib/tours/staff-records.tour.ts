import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const staffRecordsTour: TourDef = {
  id: "staffRecords",
  title: "Add your staff",
  description: "Create a profile for each person who works here.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've added a stylist and seen how deactivating works without losing their history.",
  steps: [
    {
      anchor: TOUR_ANCHORS.staff.addStaffButton,
      title: "Add a stylist",
      body: "Every appointment needs someone to assign it to. Click Add stylist to create the first profile.",
      route: "/staff",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.staffDrawer.nameField,
      title: "Name",
      body: "This is what shows up on the booking form and the day board.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.staffDrawer.phoneField,
      title: "Phone (optional)",
      body: "Handy for shift reminders — nothing here is required beyond a name.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.staffDrawer.saveButton,
      title: "Save it",
      body: "Saving a brand-new stylist takes you straight to the skills matrix next — that's covered in its own tour.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.staff.teamTab,
      title: "Back to your team",
      body: "This is the full list of everyone who works here.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.staff.toggleStaffButton,
      title: "Deactivate, don't delete",
      body: "Someone who's left doesn't need to be removed — deactivating hides them from new bookings while every past appointment they worked stays exactly as it was.",
      placement: "left",
      advanceOn: "next-click",
    },
  ],
};
