import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * Covers 4 of the page's 7 panels — Takings, Stylists, Services, and Busy
 * hours — rather than all of them, to keep the tour itself walkable in a
 * couple of minutes. Every step here is read-only, so unlike the booking
 * tours there's no destructive-action concern to design around.
 */
export const reportsOverviewTour: TourDef = {
  id: "reportsOverview",
  title: "Understand your reports",
  description: "How the salon did, for any period you choose.",
  roles: ["OWNER", "MANAGER"],
  shell: "app",
  module: "reports",
  completionTitle: "Tour complete",
  completionMessage: "You've seen four of the reports — the rest, further down the same page, follow the same idea: a number, then what it means.",
  steps: [
    {
      anchor: TOUR_ANCHORS.reports.rangeBar,
      title: "Choose your period",
      body: "Every panel on this page reads from the same date range — change it here once, and everything below updates together.",
      route: "/reports",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.reports.takingsPanel,
      title: "Takings",
      body: "What actually came in, and what was lost to discounts, refunds, and no-shows over the same period.",
      placement: "top",
      waitForAnchorMs: 5000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.reports.staffPanel,
      title: "Stylists",
      body: "Jobs finished, how full each diary was, how they were rated, and lateness — one row per stylist.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.reports.servicesPanel,
      title: "Services",
      body: "Most-booked and most-earning aren't always the same service — this is deliberately shown as two lists so that disagreement is visible.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.reports.busyHoursPanel,
      title: "When the salon is busy",
      body: "A heatmap of demand by day and hour — useful for deciding when you actually need more stylists on the rota.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
