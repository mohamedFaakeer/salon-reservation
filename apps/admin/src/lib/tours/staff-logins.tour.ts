import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

export const staffLoginsTour: TourDef = {
  id: "staffLogins",
  title: "Create staff logins",
  description: "Invite your team, and set what each of them can do.",
  // OWNER only — creating a login and assigning a role is an owner-level
  // capability (`canManageTeam`); a manager can reset a password but not
  // create a login or change a role, so this tour doesn't fit MANAGER.
  roles: ["OWNER"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've created a login and seen the one-time credential handoff — the password can't be shown again after this.",
  steps: [
    {
      anchor: TOUR_ANCHORS.team.newTeamButton,
      title: "Invite someone in",
      body: "A staff record (their name, phone, what they can perform) is separate from a login (whether they can sign in at all). Click New login to create one.",
      route: "/team",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.teamDrawer.nameField,
      title: "Name and email",
      body: "The email is what they'll sign in with.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.teamDrawer.roleFields,
      title: "Choose what they can do",
      body: "Manager, Receptionist, or Stylist — each shows you exactly what it unlocks before you commit, right here.",
      placement: "right",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.teamDrawer.saveButton,
      title: "Create the login",
      body: "That's it — they're set up to sign in.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.team.newLoginCredentials,
      title: "Give them these now",
      body: "This is the only time the password is shown. The server keeps only a hash — if they lose it, you'll need to use Reset password, not this screen again.",
      placement: "bottom",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
  ],
};
