import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, Repository } from "typeorm";
import { ApiError } from "@salon/shared";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { parseCsv } from "./csv.util";
// StockMutationService/AuditService must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportSummary {
  productsCreated: number;
  variantsCreated: number;
  products: Array<{ name: string; variantCount: number }>;
}

interface ParsedRow {
  rowNum: number;
  sku: string;
  barcode: string | null;
  priceCents: number;
  attributes: Record<string, string>;
  reorderPoint: number | null;
  openingQuantity: number | null;
  openingUnitCostCents: number | null;
}

interface ProductGroup {
  category: string | null;
  brand: string | null;
  tracksExpiry: boolean;
  trackSerial: boolean;
  rows: ParsedRow[];
}

/** The columns `POST /products/import` expects — the admin's "Download template" button emits exactly this header row. */
export const IMPORT_COLUMNS = [
  "name",
  "category",
  "brand",
  "sku",
  "barcode",
  "price_rs",
  "size_volume",
  "weight",
  "color",
  "opening_qty",
  "opening_cost_rs",
  "reorder_point",
  "tracks_expiry",
  "track_serial",
] as const;

/**
 * Bulk product setup for a new salon — one CSV, one pass. Deliberately
 * all-or-nothing: every row is validated before anything touches the
 * database, so a typo on row 40 never leaves rows 1-39 created and row 40
 * missing. A CSV column parser was written by hand rather than adding a
 * spreadsheet-parsing dependency (CLAUDE.md §3) — the format only needs
 * quoted-comma handling, which `csv.util.ts` covers in under 60 lines.
 */
@Injectable()
export class ProductImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    private readonly stockMutation: StockMutationService,
    private readonly audit: AuditService,
  ) {}

  async importProducts(tenantId: string, buffer: Buffer, actorUserId: string): Promise<ImportSummary> {
    const parsed = parseCsv(buffer.toString("utf-8"));
    if (parsed.length === 0) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "That file has no rows to import." });
    }

    const errors: ImportRowError[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const productsByName = new Map<string, ProductGroup>();

    parsed.forEach((raw, i) => {
      const rowNum = i + 2; // header is row 1
      const name = raw.name?.trim();
      if (!name) {
        errors.push({ row: rowNum, message: "Missing product name." });
        return;
      }
      const sku = raw.sku?.trim();
      if (!sku) {
        errors.push({ row: rowNum, message: "Missing SKU." });
        return;
      }
      if (seenSkus.has(sku)) {
        errors.push({ row: rowNum, message: `SKU "${sku}" is used more than once in this file.` });
        return;
      }

      const priceRs = Number(raw.price_rs);
      if (!raw.price_rs || !Number.isFinite(priceRs) || priceRs < 0) {
        errors.push({ row: rowNum, message: `Missing or invalid price_rs for "${sku}".` });
        return;
      }

      const barcode = raw.barcode?.trim() || null;
      if (barcode) {
        if (seenBarcodes.has(barcode)) {
          errors.push({ row: rowNum, message: `Barcode "${barcode}" is used more than once in this file.` });
          return;
        }
        seenBarcodes.add(barcode);
      }

      const tracksExpiry = /^y/i.test(raw.tracks_expiry ?? "");
      const trackSerial = /^y/i.test(raw.track_serial ?? "");

      let openingQuantity: number | null = null;
      let openingUnitCostCents: number | null = null;
      const qtyRaw = raw.opening_qty?.trim();
      const costRaw = raw.opening_cost_rs?.trim();
      if (qtyRaw || costRaw) {
        if (!qtyRaw || !costRaw) {
          errors.push({ row: rowNum, message: `Give both opening_qty and opening_cost_rs for "${sku}", or leave both blank.` });
          return;
        }
        const qty = Number(qtyRaw);
        const cost = Number(costRaw);
        if (!Number.isInteger(qty) || qty <= 0) {
          errors.push({ row: rowNum, message: `Invalid opening_qty for "${sku}".` });
          return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
          errors.push({ row: rowNum, message: `Invalid opening_cost_rs for "${sku}".` });
          return;
        }
        if (tracksExpiry || trackSerial) {
          errors.push({
            row: rowNum,
            message: `"${sku}" tracks ${tracksExpiry ? "expiry dates" : "serial numbers"} — leave opening_qty blank and receive this stock separately after import.`,
          });
          return;
        }
        openingQuantity = qty;
        openingUnitCostCents = Math.round(cost * 100);
      }

      let reorderPoint: number | null = null;
      const reorderRaw = raw.reorder_point?.trim();
      if (reorderRaw) {
        reorderPoint = Number(reorderRaw);
        if (!Number.isInteger(reorderPoint) || reorderPoint < 0) {
          errors.push({ row: rowNum, message: `Invalid reorder_point for "${sku}".` });
          return;
        }
      }

      const attributes: Record<string, string> = {};
      if (raw.size_volume?.trim()) attributes.size = raw.size_volume.trim();
      if (raw.weight?.trim()) attributes.weight = raw.weight.trim();
      if (raw.color?.trim()) attributes.color = raw.color.trim();

      let group = productsByName.get(name);
      if (!group) {
        group = { category: raw.category?.trim() || null, brand: raw.brand?.trim() || null, tracksExpiry, trackSerial, rows: [] };
        productsByName.set(name, group);
      } else if (group.tracksExpiry !== tracksExpiry || group.trackSerial !== trackSerial) {
        errors.push({
          row: rowNum,
          message: `"${name}" has inconsistent tracks_expiry/track_serial across its rows — every row for the same product must match.`,
        });
        return;
      }

      seenSkus.add(sku);
      group.rows.push({ rowNum, sku, barcode, priceCents: Math.round(priceRs * 100), attributes, reorderPoint, openingQuantity, openingUnitCostCents });
    });

    if (errors.length === 0 && seenSkus.size > 0) {
      const existing = await this.variants.find({
        where: [
          { tenantId, sku: In([...seenSkus]) },
          ...(seenBarcodes.size > 0 ? [{ tenantId, barcode: In([...seenBarcodes]) } as const] : []),
        ],
        select: { sku: true, barcode: true },
      });
      const existingSkus = new Set(existing.map((v) => v.sku));
      const existingBarcodes = new Set(existing.filter((v) => v.barcode).map((v) => v.barcode as string));
      for (const group of productsByName.values()) {
        for (const row of group.rows) {
          if (existingSkus.has(row.sku)) {
            errors.push({ row: row.rowNum, message: `SKU "${row.sku}" already exists.` });
          } else if (row.barcode && existingBarcodes.has(row.barcode)) {
            errors.push({ row: row.rowNum, message: `Barcode "${row.barcode}" already exists.` });
          }
        }
      }
    }

    if (errors.length > 0) {
      errors.sort((a, b) => a.row - b.row);
      throw new ApiError({
        statusCode: 400,
        code: "IMPORT_VALIDATION_FAILED",
        message: `${errors.length} row${errors.length === 1 ? "" : "s"} need fixing before anything is imported.`,
        details: { rowErrors: errors },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      let variantsCreated = 0;
      const productSummaries: Array<{ name: string; variantCount: number }> = [];

      for (const [name, group] of productsByName) {
        const product = await manager.getRepository(Product).save(
          manager.getRepository(Product).create({
            tenantId,
            name,
            category: group.category,
            brand: group.brand,
            tracksExpiry: group.tracksExpiry,
            trackSerial: group.trackSerial,
            active: true,
          }),
        );

        for (const row of group.rows) {
          const variant = await manager.getRepository(ProductVariant).save(
            manager.getRepository(ProductVariant).create({
              tenantId,
              productId: product.id,
              sku: row.sku,
              barcode: row.barcode,
              attributes: row.attributes,
              priceCents: row.priceCents,
              weightedAvgCostCents: row.openingUnitCostCents ?? 0,
              quantityOnHand: 0,
              reorderPoint: row.reorderPoint,
              active: true,
            }),
          );
          if (row.openingQuantity && row.openingUnitCostCents !== null) {
            await this.stockMutation.openBatch(manager, {
              tenantId,
              variantId: variant.id,
              quantity: row.openingQuantity,
              unitCostCents: row.openingUnitCostCents,
              referenceType: "ProductImport",
              referenceId: product.id,
              actorUserId,
            });
          }
          variantsCreated++;
        }
        productSummaries.push({ name, variantCount: group.rows.length });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "PRODUCTS_IMPORTED",
          entityType: "Tenant",
          entityId: tenantId,
          metadata: { productsCreated: productSummaries.length, variantsCreated },
        },
        manager,
      );

      return { productsCreated: productSummaries.length, variantsCreated, products: productSummaries };
    });
  }
}
