import type { Invoice } from "../entities/invoice.entity";

/**
 * The invoice as an email.
 *
 * Rendered from the frozen snapshot, never from live rows — that is the whole
 * point of the snapshot. Resending a year-old invoice must produce exactly the
 * document that was sent then, even if the salon has since renamed itself,
 * changed its prices or lost the stylist.
 *
 * Plain text as well as HTML, because a mail client that refuses HTML should
 * still show a customer what they paid rather than an empty message.
 */

export interface RenderedInvoice {
  subject: string;
  text: string;
  html: string;
}

export function renderInvoiceEmail(invoice: Invoice): RenderedInvoice {
  const { salon, customer, appointment, lines, billDiscount, payments } = invoice.snapshot;
  const when = formatDateTime(appointment.startTime);

  const subject = `Invoice ${invoice.number} — ${salon.name}`;

  const textLines = [
    salon.name,
    [salon.address, salon.city].filter(Boolean).join(", "),
    salon.phone ? `Tel ${salon.phone}` : null,
    salon.businessRegNo ? `Business reg. ${salon.businessRegNo}` : null,
    "",
    `INVOICE ${invoice.number}`,
    invoice.version > 1 ? `Replaces an earlier invoice (version ${invoice.version})` : null,
    `Issued ${formatDate(invoice.issuedAt)}`,
    "",
    `Billed to: ${customer.name}`,
    `Visit: ${when} with ${appointment.staffName} (ref ${appointment.bookingReference})`,
    "",
    ...lines.map((l) =>
      l.discountCents > 0
        ? `${l.name} — ${money(l.listPriceCents)} less ${money(l.discountCents)} (${l.discountLabel ?? "offer"}) = ${money(l.chargedCents)}`
        : `${l.name} — ${money(l.chargedCents)}`,
    ),
    "",
    `Subtotal: ${money(invoice.subtotalCents)}`,
    invoice.serviceDiscountCents > 0 ? `Offers: -${money(invoice.serviceDiscountCents)}` : null,
    billDiscount ? `Discount${billDiscount.reason ? ` (${billDiscount.reason})` : ""}: -${money(billDiscount.cents)}` : null,
    `Total: ${money(invoice.totalCents)}`,
    `Paid: ${money(invoice.paidCents)}`,
    `Balance: ${money(invoice.balanceCents)}`,
    "",
    ...payments.map(
      (p) =>
        `  ${formatDate(p.recordedAt)} — ${methodLabel(p.method)} ${money(p.amountCents)}` +
        (p.changeCents ? ` (tendered ${money(p.tenderedCents ?? 0)}, change ${money(p.changeCents)})` : ""),
    ),
    "",
    "Thank you.",
  ].filter((l): l is string => l !== null);

  return { subject, text: textLines.join("\n"), html: renderHtml(invoice) };
}

/**
 * Table-based, inline-styled HTML.
 *
 * Not a stylistic choice: email clients strip <style> blocks and have no
 * meaningful flexbox support, so anything modern would arrive as an unstyled
 * column. This is the one place in the codebase where 2005 markup is correct.
 */
function renderHtml(invoice: Invoice): string {
  const { salon, customer, appointment, lines, billDiscount, payments } = invoice.snapshot;

  const row = (label: string, value: string, strong = false, muted = false): string =>
    `<tr>
       <td style="padding:6px 0;color:${muted ? "#64748b" : "#0f172a"};font-size:14px${strong ? ";font-weight:600" : ""}">${escape(label)}</td>
       <td align="right" style="padding:6px 0;color:${muted ? "#64748b" : "#0f172a"};font-size:14px;font-variant-numeric:tabular-nums${strong ? ";font-weight:600" : ""}">${escape(value)}</td>
     </tr>`;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
  <tr><td style="padding:24px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${
        salon.logoUrl
          ? `<td width="56" style="vertical-align:top;padding-right:14px;">
               <table role="presentation" width="56" height="56" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;">
                 <tr><td align="center" valign="middle" style="padding:5px;">
                   <img src="${escape(salon.logoUrl)}" width="46" height="46" alt="${escape(salon.name)} logo" style="display:block;max-width:46px;max-height:46px;width:auto;height:auto;">
                 </td></tr>
               </table>
             </td>`
          : ""
      }
      <td style="vertical-align:top;">
        <div style="font-size:17px;font-weight:600;color:#0f172a;">${escape(salon.name)}</div>
        <div style="font-size:12px;color:#64748b;line-height:1.6;">
          ${escape([salon.address, salon.city].filter(Boolean).join(", "))}
          ${salon.phone ? `<br>${escape(salon.phone)}` : ""}
          ${salon.businessRegNo ? `<br>Business reg. ${escape(salon.businessRegNo)}` : ""}
        </div>
      </td>
      <td align="right" style="vertical-align:top;">
        <div style="font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#64748b;">Invoice</div>
        <div style="font-size:17px;font-weight:600;color:#0d9488;font-variant-numeric:tabular-nums;">${escape(invoice.number)}</div>
        <div style="font-size:12px;color:#64748b;">${escape(formatDate(invoice.issuedAt))}</div>
      </td>
    </tr></table>
  </td></tr>

  ${
    invoice.version > 1
      ? `<tr><td style="padding:16px 24px 0;">
           <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;font-size:12.5px;color:#78350f;">
             This replaces an earlier invoice for the same visit. Please use this one.
           </div>
         </td></tr>`
      : ""
  }

  <tr><td style="padding:20px 24px 0;">
    <div style="font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#64748b;">Billed to</div>
    <div style="font-size:14px;color:#0f172a;font-weight:500;">${escape(customer.name)}</div>
    <div style="font-size:12.5px;color:#64748b;">${escape(customer.phone)}</div>
    <div style="font-size:12.5px;color:#64748b;margin-top:8px;">
      ${escape(formatDateTime(appointment.startTime))} with ${escape(appointment.staffName)}
      &middot; ref ${escape(appointment.bookingReference)}
    </div>
  </td></tr>

  <tr><td style="padding:18px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
      ${lines
        .map(
          (l) => `<tr>
            <td style="padding:10px 0 10px;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:14px;color:#0f172a;">${escape(l.name)}</div>
              <div style="font-size:11.5px;color:#94a3b8;">${l.durationMin} min</div>
              ${
                l.discountCents > 0
                  ? `<div style="font-size:11.5px;color:#0f766e;">${escape(l.discountLabel ?? "Offer")} &minus;${escape(money(l.discountCents))}</div>`
                  : ""
              }
            </td>
            <td align="right" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;font-variant-numeric:tabular-nums;">
              ${
                l.discountCents > 0
                  ? `<span style="color:#94a3b8;text-decoration:line-through;">${escape(money(l.listPriceCents))}</span><br>`
                  : ""
              }${escape(money(l.chargedCents))}
            </td>
          </tr>`,
        )
        .join("")}
    </table>
  </td></tr>

  <tr><td style="padding:12px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Subtotal", money(invoice.subtotalCents), false, true)}
      ${invoice.serviceDiscountCents > 0 ? row("Offers", `−${money(invoice.serviceDiscountCents)}`, false, true) : ""}
      ${billDiscount ? row(billDiscount.reason ? `Discount — ${billDiscount.reason}` : "Discount", `−${money(billDiscount.cents)}`, false, true) : ""}
      <tr><td colspan="2" style="border-top:1.5px solid #e2e8f0;height:8px;"></td></tr>
      ${row("Total", money(invoice.totalCents), true)}
      ${row("Paid", money(invoice.paidCents), false, true)}
      ${row(invoice.balanceCents > 0 ? "Balance due" : "Settled", money(Math.max(0, invoice.balanceCents)), true)}
    </table>
  </td></tr>

  ${
    payments.length > 0
      ? `<tr><td style="padding:16px 24px 0;">
           <div style="font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#64748b;">Payments received</div>
           ${payments
             .map(
               (p) =>
                 `<div style="font-size:12.5px;color:#334155;font-variant-numeric:tabular-nums;padding-top:4px;">${escape(formatDate(p.recordedAt))} &middot; ${escape(methodLabel(p.method))} &middot; ${escape(money(p.amountCents))}${
                   p.changeCents
                     ? ` <span style="color:#64748b;">(tendered ${escape(money(p.tenderedCents ?? 0))}, change ${escape(money(p.changeCents))})</span>`
                     : ""
                 }</div>`,
             )
             .join("")}
         </td></tr>`
      : ""
  }

  <tr><td style="padding:22px 24px 24px;">
    <div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;color:#94a3b8;">
      Thank you for visiting ${escape(salon.name)}.
    </div>
  </td></tr>
</table>
</body></html>`;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD_CAPTURED: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
  GATEWAY: "Gateway",
  GIFT_CARD: "Gift card",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function money(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | Date | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  });
}

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

/** Customer and salon names reach this template unfiltered; none of them is markup. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
