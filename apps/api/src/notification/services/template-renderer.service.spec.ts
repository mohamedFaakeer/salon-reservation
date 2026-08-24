import { describe, expect, it } from "vitest";
import { TemplateRendererService } from "./template-renderer.service";
import { NotificationChannel } from "@salon/shared";

describe("TemplateRendererService", () => {
  const service = new TemplateRendererService();

  it("renders simple template variables correctly", () => {
    const template = "Hello {{customerName}}, your appointment with {{staffName}} is on {{appointmentDate}} at {{appointmentTime}}.";
    const context = {
      customerName: "Jane Doe",
      staffName: "Sarah Smith",
      appointmentDate: "December 15, 2024",
      appointmentTime: "2:30 PM",
    };

    const result = service.render(null, template, context, NotificationChannel.SMS);
    expect(result.body).toBe("Hello Jane Doe, your appointment with Sarah Smith is on December 15, 2024 at 2:30 PM.");
    expect(result.usedVariables).toContain("customerName");
    expect(result.usedVariables).toContain("staffName");
    expect(result.usedVariables).toContain("appointmentDate");
    expect(result.usedVariables).toContain("appointmentTime");
  });

  it("renders email subject and body", () => {
    const subjectTemplate = "Booking Confirmed - {{salonName}}";
    const bodyTemplate = "Dear {{customerName}}, your booking {{bookingReference}} is confirmed.";
    const context = {
      salonName: "Elegance Salon",
      customerName: "Jane Doe",
      bookingReference: "BK-1234",
    };

    const result = service.render(subjectTemplate, bodyTemplate, context, NotificationChannel.EMAIL);
    expect(result.subject).toBe("Booking Confirmed - Elegance Salon");
    expect(result.body).toBe("Dear Jane Doe, your booking BK-1234 is confirmed.");
  });

  it("handles formatCurrency helper", () => {
    const template = "Total charged: {{formatCurrency totalAmount}}";
    const context = {
      totalAmount: "5000",
    };

    const result = service.render(null, template, context, NotificationChannel.CONSOLE);
    expect(result.body).toContain("5,000.00");
  });

  it("handles truncate and ifEquals helpers", () => {
    const template = "{{#ifEquals status 'CONFIRMED'}}Confirmed: {{truncate text 10}}{{/ifEquals}}";
    const context = {
      status: "CONFIRMED",
      text: "Very long description text",
    };

    const result = service.render(null, template, context, NotificationChannel.CONSOLE);
    expect(result.body).toBe("Confirmed: Very lo...");
  });

  it("provides preview with example defaults", () => {
    const body = "Hi {{customerName}}, your booking at {{salonName}} is {{bookingReference}}.";
    const result = service.renderPreview(null, body, NotificationChannel.SMS);
    expect(result.body).toBe("Hi Jane Doe, your booking at Elegance Salon & Spa is BK-20241215-0042.");
  });

  it("returns variables by channel filter", () => {
    const smsVars = service.getVariables(NotificationChannel.SMS);
    const emailVars = service.getVariables(NotificationChannel.EMAIL);

    expect(smsVars.some((v) => v.key === "customerPhone")).toBe(true);
    expect(smsVars.some((v) => v.key === "customerEmail")).toBe(false);
    expect(emailVars.some((v) => v.key === "customerEmail")).toBe(true);
  });
});
