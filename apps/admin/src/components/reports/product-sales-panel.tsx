import type { ProductSalesReport } from "../../lib/api-client";
import { formatPriceCents } from "../../lib/format";
import { Card, Figure, LockedPanel, Panel, Quiet, Th, Td } from "./report-shell";

/**
 * Revenue, cost and margin on retail product sales. Cost is each line's
 * `unitCostCentsSnapshot` — the variant's weighted-average cost frozen at
 * sale time, never today's current cost, matching every other snapshot
 * column this report reads from.
 */
export function ProductSalesPanel({ data }: { data: ProductSalesReport | null }) {
  if (!data) {
    return (
      <LockedPanel
        title="Product sales & margin"
        teaser="Ask about upgrading to see revenue, cost and margin on what the salon sells at the counter."
      />
    );
  }

  if (data.byProduct.length === 0) {
    return (
      <Panel title="Product sales & margin">
        <Card>
          <Quiet>Nothing was sold at the counter in this period.</Quiet>
        </Card>
      </Panel>
    );
  }

  const marginPercent = data.totalRevenueCents > 0 ? Math.round((data.totalMarginCents / data.totalRevenueCents) * 1000) / 10 : 0;

  return (
    <Panel title="Product sales & margin">
      <Card>
        <div className="grid grid-cols-3">
          <Figure label="Revenue" value={formatPriceCents(data.totalRevenueCents)} />
          <Figure label="Cost" value={formatPriceCents(data.totalCostCents)} detail="weighted-average, at sale time" />
          <Figure label="Margin" value={formatPriceCents(data.totalMarginCents)} detail={`${marginPercent}% of revenue`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th align="right">Units</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {data.byProduct.map((row) => (
                <tr key={row.variantId}>
                  <Td className="font-medium text-slate-900">{row.productName}</Td>
                  <Td className="font-mono text-[12px] text-slate-500">{row.sku ?? "Bundle"}</Td>
                  <Td align="right" className="tabular">
                    {row.unitsSold}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatPriceCents(row.revenueCents)}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatPriceCents(row.costCents)}
                  </Td>
                  <Td align="right" className="tabular font-semibold text-emerald-700">
                    {formatPriceCents(row.marginCents)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Panel>
  );
}
