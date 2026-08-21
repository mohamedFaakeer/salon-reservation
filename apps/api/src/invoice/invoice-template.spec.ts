import { renderInvoiceEmail } from "./invoice-template";
import type { Invoice } from "../entities/invoice.entity";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    number: "EAGL-2026-0001",
    version: 1,
    issuedAt: new Date("2026-09-08T06:00:00.000Z"),
    subtotalCents: 800_000,
    serviceDiscountCents: 100_000,
    billDiscountCents: 40_000,
    totalCents: 660_000,
    paidCents: 660_000,
    balanceCents: 0,
    currency: "LKR",
    snapshot: {
      salon: {
        name: "Eagle Salon",
        address: "12 Galle Road",
        city: "Colombo 05",
        phone: "0112345678",
        businessRegNo: null,
      },
      customer: { name: "Nimali Perera", phone: "+94771234567", email: "n@example.com" },
      appointment: {
        bookingReference: "EAGL-9F2K1",
        startTime: "2026-09-08T11:30:00.000Z",
        staffName: "Nadia",
      },
      lines: [
        {
          name: "Hair Colour",
          durationMin: 90,
          listPriceCents: 500_000,
          discountCents: 100_000,
          discountLabel: "September evenings",
          chargedCents: 400_000,
        },
        {
          name: "Cut & Blow Dry",
          durationMin: 45,
          listPriceCents: 300_000,
          discountCents: 0,
          discountLabel: null,
          chargedCents: 300_000,
        },
      ],
      billDiscount: { type: "PERCENT", value: 10, cents: 40_000, reason: "Regular customer" },
      payments: [{ method: "CASH", amountCents: 660_000, recordedAt: "2026-09-08T07:00:00.000Z" }],
    },
    ...overrides,
  } as Invoice;
}

describe("renderInvoiceEmail", () => {
  it("names the salon and the invoice in the subject", () => {
    expect(renderInvoiceEmail(invoice()).subject).toBe("Invoice EAGL-2026-0001 — Eagle Salon");
  });

  describe("both parts are produced", () => {
    it("sends plain text as well as HTML", () => {
      // A client that refuses HTML must still show what was paid rather than
      // an empty message.
      const rendered = renderInvoiceEmail(invoice());

      expect(rendered.text).toContain("INVOICE EAGL-2026-0001");
      expect(rendered.html).toContain("EAGL-2026-0001");
    });
  });

  describe("what the customer can check", () => {
    it("shows each line's list price, what came off, and what was charged", () => {
      const { text } = renderInvoiceEmail(invoice());

      expect(text).toContain("Hair Colour");
      expect(text).toContain("LKR 5,000.00");
      expect(text).toContain("September evenings");
      expect(text).toContain("LKR 4,000.00");
    });

    it("names the desk discount and its reason", () => {
      const { text } = renderInvoiceEmail(invoice());

      expect(text).toContain("Discount (Regular customer): -LKR 400.00");
    });

    it("separates the salon's offers from the desk's discount", () => {
      // One is a published price, the other somebody's decision. A single
      // merged figure would hide which.
      const { text } = renderInvoiceEmail(invoice());

      expect(text).toContain("Offers: -LKR 1,000.00");
      expect(text).toContain("Discount");
    });

    it("lists the payments received", () => {
      expect(renderInvoiceEmail(invoice()).text).toContain("Cash LKR 6,600.00");
    });
  });

  describe("corrections", () => {
    it("says plainly when it replaces an earlier invoice", () => {
      const { text, html } = renderInvoiceEmail(invoice({ version: 2 }));

      expect(text).toContain("Replaces an earlier invoice");
      expect(html).toContain("replaces an earlier invoice");
    });

    it("says nothing of the sort on an original", () => {
      expect(renderInvoiceEmail(invoice()).text).not.toContain("Replaces an earlier");
    });
  });

  describe("optional details", () => {
    it("omits the registration line entirely when the salon has none", () => {
      // An empty label is worse than no label.
      expect(renderInvoiceEmail(invoice()).text).not.toContain("Business reg.");
    });

    it("prints it when the salon has one", () => {
      const withReg = invoice();
      withReg.snapshot.salon.businessRegNo = "PV 12345";

      expect(renderInvoiceEmail(withReg).text).toContain("Business reg. PV 12345");
    });
  });

  describe("safety", () => {
    it("escapes a customer name that looks like markup", () => {
      // Names arrive from a public booking form and are never markup.
      const nasty = invoice();
      nasty.snapshot.customer.name = '<script>alert("x")</script>';

      const { html } = renderInvoiceEmail(nasty);

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes a salon name with an ampersand", () => {
      const amp = invoice();
      amp.snapshot.salon.name = "Cut & Curl";

      expect(renderInvoiceEmail(amp).html).toContain("Cut &amp; Curl");
    });
  });

  it("renders from the snapshot, never from live rows", () => {
    // The point of the snapshot: a year-old invoice resent today must show the
    // salon as it was, not as it is.
    const old = invoice();
    old.snapshot.salon.name = "The Old Name";

    expect(renderInvoiceEmail(old).text).toContain("The Old Name");
  });
});
