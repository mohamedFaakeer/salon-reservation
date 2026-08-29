import { explainStaffNotification } from "./explain-staff-notification";

const START = new Date("2026-08-30T09:30:00.000Z"); // ~15:00 Colombo local

describe("explainStaffNotification", () => {
  it("names the customer and stylist for a new online booking", () => {
    const copy = explainStaffNotification({
      type: "APPOINTMENT_CREATED_ONLINE",
      customerName: "Kavindi Perera",
      staffName: "Sanduni Fernando",
      startTime: START,
    });

    expect(copy.title).toBe("New online booking");
    expect(copy.body).toContain("Kavindi Perera");
    expect(copy.body).toContain("Sanduni Fernando");
    expect(copy.body).toContain("booked with");
  });

  it("names the customer and stylist for a self-service cancellation", () => {
    const copy = explainStaffNotification({
      type: "APPOINTMENT_CANCELLED_SELF",
      customerName: "Kavindi Perera",
      staffName: "Sanduni Fernando",
      startTime: START,
    });

    expect(copy.title).toBe("Booking cancelled");
    expect(copy.body).toContain("Kavindi Perera");
    expect(copy.body).toContain("cancelled");
  });

  it("names the customer and stylist for a self-service reschedule", () => {
    const copy = explainStaffNotification({
      type: "APPOINTMENT_RESCHEDULED_SELF",
      customerName: "Kavindi Perera",
      staffName: "Sanduni Fernando",
      startTime: START,
    });

    expect(copy.title).toBe("Booking rescheduled");
    expect(copy.body).toContain("moved their appointment");
  });

  it("renders the appointment time in Colombo local, not the raw UTC instant", () => {
    const copy = explainStaffNotification({
      type: "APPOINTMENT_CREATED_ONLINE",
      customerName: "Kavindi Perera",
      staffName: "Sanduni Fernando",
      startTime: START,
    });

    // 09:30 UTC == 15:00 Colombo (+05:30) — never the literal "09:30".
    expect(copy.body).toContain("3:00 PM");
  });
});
