import type { StaffNotificationType } from "../entities/staff-notification.entity";

export interface StaffNotificationFacts {
  type: StaffNotificationType;
  customerName: string;
  staffName: string;
  startTime: Date;
}

export interface StaffNotificationCopy {
  title: string;
  body: string;
}

function formatAppointmentTime(date: Date): string {
  return new Intl.DateTimeFormat("en-LK", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(date);
}

/**
 * Plain-language copy for the notification bell — pure and exhaustively
 * testable, same convention `monitoring/explain-event.ts` already
 * established: name the customer and stylist, never a raw action string.
 */
export function explainStaffNotification(facts: StaffNotificationFacts): StaffNotificationCopy {
  const time = formatAppointmentTime(facts.startTime);
  switch (facts.type) {
    case "APPOINTMENT_CREATED_ONLINE":
      return {
        title: "New online booking",
        body: `${facts.customerName} booked with ${facts.staffName} for ${time}.`,
      };
    case "APPOINTMENT_CANCELLED_SELF":
      return {
        title: "Booking cancelled",
        body: `${facts.customerName} cancelled their ${time} appointment with ${facts.staffName}.`,
      };
    case "APPOINTMENT_RESCHEDULED_SELF":
      return {
        title: "Booking rescheduled",
        body: `${facts.customerName} moved their appointment with ${facts.staffName} to ${time}.`,
      };
  }
}
