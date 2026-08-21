import Link from "next/link";
import type { CustomerSpendRow, LapsedCustomerRow } from "../../lib/api-client";
import { formatDate, formatPhone, formatPriceCents } from "../../lib/format";
import { Card, Panel, Quiet, Td, Th } from "./report-shell";

/**
 * Who is worth calling, and who is worth keeping.
 *
 * The lapsed list comes first and gets phone numbers, because it is the only
 * panel on this screen that is a task rather than a fact. The rest of the
 * page tells an owner how the salon did; this one tells them who to ring.
 */

export function LapsedPanel({ rows }: { rows: LapsedCustomerRow[] }) {
  return (
    <Panel title="Worth a call" note="regulars who have not been back in 60 days">
      <Card>
        {rows.length === 0 ? (
          <Quiet>Nobody has gone quiet — every regular has been in recently.</Quiet>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Customers who have not returned in 60 days</caption>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th>Used to book</Th>
                  <Th align="right">Last visit</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.customerId} data-testid={`report-lapsed-${row.customerId}`}>
                    <Td>
                      <Link
                        href={`/customers/${row.customerId}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {row.name}
                      </Link>
                    </Td>
                    <Td className="text-slate-700 tabular">{formatPhone(row.phone)}</Td>
                    <Td>
                      {row.usualServices.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {row.usualServices.map((name) => (
                            <span
                              key={name}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              {name}
                            </span>
                          ))}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="font-medium text-amber-700 tabular">
                        {row.daysSince} days
                      </span>
                      <span className="block text-xs text-slate-500 tabular">
                        {formatDate(`${row.lastVisitDate}T00:00:00.000Z`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Panel>
  );
}

export function CustomersPanel({
  topSpenders,
  frequent,
}: {
  topSpenders: CustomerSpendRow[];
  frequent: CustomerSpendRow[];
}) {
  return (
    <Panel title="Customers" note="in this period">
      <div className="grid gap-4 lg:grid-cols-2">
        <SpendTable
          heading="Spent most"
          rows={topSpenders}
          empty="No payments were taken in this period."
          primary={(r) => formatPriceCents(r.totalCents)}
          primaryLabel="Spent"
          secondary={(r) => String(r.visits)}
          secondaryLabel="Visits"
          testId="report-spenders"
        />
        <SpendTable
          heading="Came most"
          rows={frequent}
          empty="No visits were completed in this period."
          primary={(r) => String(r.visits)}
          primaryLabel="Visits"
          secondary={(r) => formatPriceCents(r.totalCents)}
          secondaryLabel="Billed"
          testId="report-frequent"
        />
      </div>
    </Panel>
  );
}

function SpendTable({
  heading,
  rows,
  empty,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  testId,
}: {
  heading: string;
  rows: CustomerSpendRow[];
  empty: string;
  primary: (row: CustomerSpendRow) => string;
  primaryLabel: string;
  secondary: (row: CustomerSpendRow) => string;
  secondaryLabel: string;
  testId: string;
}) {
  return (
    <Card>
      {rows.length === 0 ? (
        <>
          <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
              {heading}
            </h3>
          </div>
          <Quiet>{empty}</Quiet>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid={testId}>
            <caption className="sr-only">{heading}</caption>
            <thead>
              <tr>
                <Th>{heading}</Th>
                <Th align="right">{primaryLabel}</Th>
                <Th align="right">{secondaryLabel}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <Td>
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </Td>
                  <Td align="right" className="tabular">
                    {primary(row)}
                  </Td>
                  <Td align="right" className="text-slate-500 tabular">
                    {secondary(row)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
