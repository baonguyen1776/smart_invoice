import { describe, expect, it } from "vitest";
import type {
  ProductSpreadsheetParser,
  ProductSpreadsheetRow,
} from "../ports/ProductSpreadsheetParser";
import { ok } from "../shared/Result";
import { Product } from "../../domain/entities/Product";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import { Unit } from "../../domain/entities/Unit";
import { InMemoryProductAliasRepository } from "../../test/doubles/InMemoryProductAliasRepository";
import { InMemoryProductRepository } from "../../test/doubles/InMemoryProductRepository";
import { PreviewProductSpreadsheetImport } from "./PreviewProductSpreadsheetImport";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const ALIAS_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-20T00:00:00.000Z";

describe("PreviewProductSpreadsheetImport", () => {
  it("groups alternate units, normalizes category, and proposes an explained fuzzy match", async () => {
    const existing = product({ sku: "BB-TL-027", name: "Bút bi Thiên Long 027" });
    const result = await preview(
      [
        row({ sourceRowNumber: 2, sku: "TL027", name: "Bút bi TL027", price: 3500 }),
        row({
          sourceRowNumber: 3,
          sku: "TL027-H",
          name: "Bút bi TL027",
          price: 35_000,
          unitName: "Hộp",
          baseUnitSku: "TL027",
          ratio: 10,
        }),
      ],
      [existing],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ sourceRowCount: 2, productCount: 1, unitCount: 2 });
    expect(result.value.candidates[0]).toMatchObject({
      sku: "TL027",
      category: "Viết",
      matchKind: "possible-duplicate",
      requiresDecision: true,
      isBlocked: false,
      aliases: [{ alias: "TL027-H", unitName: "Hộp" }],
    });
    expect(result.value.candidates[0].possibleMatches[0]).toMatchObject({
      product: existing,
      score: 90,
      confidence: "high",
    });
  });

  it("shows the real TL008 database product as a match for KiotViet BTL08", async () => {
    const existing = Product.create({
      id: PRODUCT_ID,
      sku: "TL008",
      name: "Bút bi thiên long 008",
      brand: "Thiên Long",
      category: "Bút bi",
      createdAt: NOW,
      units: [
        Unit.create({
          id: UNIT_ID,
          productId: PRODUCT_ID,
          name: "Cây",
          price: 4000,
          createdAt: NOW,
        }),
      ],
    });
    const result = await preview(
      [
        {
          ...row({ sku: "BTL08", name: "Bút bi TL-08", price: 4000 }),
          brand: "Thiên Long",
        },
        {
          ...row({
            sourceRowNumber: 3,
            sku: "BTL08H",
            name: "Bút bi TL-08",
            price: 80_000,
            unitName: "Hộp",
            baseUnitSku: "BTL08",
            ratio: 20,
          }),
          brand: "Thiên Long",
        },
      ],
      [existing],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]).toMatchObject({
      matchKind: "possible-duplicate",
      requiresDecision: true,
      possibleMatches: [
        expect.objectContaining({ product: existing, score: 85, confidence: "high" }),
      ],
    });
  });

  it("requires an explicit decision for exact SKU and confirmed alias matches", async () => {
    const existing = product({ sku: "TL027", name: "Bút bi Thiên Long 027" });
    const exact = await preview([row({})], [existing]);
    expect(exact.ok && exact.value.candidates[0].matchKind).toBe("existing-sku");

    const alias = ProductAlias.create({
      id: ALIAS_ID,
      productId: PRODUCT_ID,
      alias: "TL-ALT",
      sourceKey: "kiotviet",
      createdAt: NOW,
    });
    const aliasResult = await preview([row({ sku: "TL-ALT" })], [existing], [alias]);
    expect(aliasResult.ok && aliasResult.value.candidates[0]).toMatchObject({
      matchKind: "existing-alias",
      requiresDecision: true,
      exactMatches: [existing],
    });
  });

  it("detects conflicting database matches from alternate-unit codes", async () => {
    const baseProduct = product({ sku: "TL027", name: "Bút bi Thiên Long 027" });
    const otherProduct = Product.create({
      id: "44444444-4444-4444-8444-444444444444",
      sku: "TL027-H",
      name: "Sản phẩm khác",
      brand: null,
      category: null,
      createdAt: NOW,
      units: [
        Unit.create({
          id: "55555555-5555-4555-8555-555555555555",
          productId: "44444444-4444-4444-8444-444444444444",
          name: "Hộp",
          price: 20_000,
          createdAt: NOW,
        }),
      ],
    });
    const result = await preview(
      [
        row({ sourceRowNumber: 2, sku: "TL027" }),
        row({
          sourceRowNumber: 3,
          sku: "TL027-H",
          baseUnitSku: "TL027",
          unitName: "Hộp",
        }),
      ],
      [baseProduct, otherProduct],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]).toMatchObject({
      matchKind: "ambiguous-alias",
      requiresDecision: true,
      exactMatches: [baseProduct, otherProduct],
    });
  });

  it("keeps fractional prices unresolved and exposes a suggested integer price", async () => {
    const result = await preview([row({ price: 7083.33 })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]).toMatchObject({
      requiresDecision: true,
      isBlocked: false,
      issues: [expect.objectContaining({ code: "fractional_price", severity: "warning" })],
      units: [
        expect.objectContaining({
          sourcePrice: 7083.33,
          acceptedPrice: null,
          suggestedPrice: 7083,
          requiresPriceDecision: true,
        }),
      ],
    });
  });

  it("keeps invalid and zero prices editable instead of blocking the whole product", async () => {
    const invalid = await preview([row({ price: "không có giá" })]);
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    expect(invalid.value.candidates[0]).toMatchObject({
      isBlocked: false,
      issues: [expect.objectContaining({ code: "invalid_price", severity: "warning" })],
      units: [
        expect.objectContaining({
          sourcePrice: null,
          acceptedPrice: null,
          suggestedPrice: null,
          requiresPriceDecision: true,
        }),
      ],
    });

    const zero = await preview([row({ price: 0 })]);
    expect(zero.ok).toBe(true);
    if (!zero.ok) return;
    expect(zero.value.candidates[0]).toMatchObject({
      isBlocked: false,
      issues: [expect.objectContaining({ code: "zero_price", severity: "warning" })],
      units: [
        expect.objectContaining({
          sourcePrice: 0,
          acceptedPrice: null,
          suggestedPrice: 0,
          requiresPriceDecision: true,
        }),
      ],
    });
  });

  it("blocks missing base products and duplicate units", async () => {
    const missingBase = await preview([
      row({ sourceRowNumber: 4, sku: "ALT", baseUnitSku: "MISSING", unitName: "Hộp" }),
    ]);
    expect(missingBase.ok && missingBase.value.candidates[0]).toMatchObject({
      isBlocked: true,
      issues: [expect.objectContaining({ code: "missing_base_product", severity: "error" })],
    });

    const duplicateUnit = await preview([
      row({ sourceRowNumber: 2, sku: "TL027", unitName: "Cây" }),
      row({
        sourceRowNumber: 3,
        sku: "TL027-H",
        baseUnitSku: "TL027",
        unitName: "cây",
      }),
    ]);
    expect(duplicateUnit.ok && duplicateUnit.value.candidates[0]).toMatchObject({
      isBlocked: true,
      issues: [expect.objectContaining({ code: "duplicate_unit", severity: "error" })],
    });
  });
});

async function preview(
  rows: readonly ProductSpreadsheetRow[],
  products: readonly Product[] = [],
  aliases: readonly ProductAlias[] = [],
) {
  const parser: ProductSpreadsheetParser = { parse: async () => ok(rows) };
  return new PreviewProductSpreadsheetImport(
    parser,
    new InMemoryProductRepository(products),
    new InMemoryProductAliasRepository(aliases),
  ).execute(new ArrayBuffer(0));
}

function row(
  input: {
    readonly sourceRowNumber?: number;
    readonly sku?: string;
    readonly name?: string;
    readonly price?: ProductSpreadsheetRow["salePrice"];
    readonly unitName?: string;
    readonly baseUnitSku?: string | null;
    readonly ratio?: number;
  } = {},
): ProductSpreadsheetRow {
  return {
    sourceRowNumber: input.sourceRowNumber ?? 2,
    sku: input.sku ?? "TL027",
    name: input.name ?? "Bút bi TL027",
    salePrice: input.price ?? 3500,
    unitName: input.unitName ?? "Cây",
    baseUnitSku: input.baseUnitSku ?? null,
    brand: null,
    categoryPath: "VPP>>Viết",
    conversionRatio: input.ratio ?? 1,
    isActive: true,
  };
}

function product(input: { readonly sku: string; readonly name: string }): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: input.sku,
    name: input.name,
    brand: null,
    category: "Viết",
    createdAt: NOW,
    units: [
      Unit.create({ id: UNIT_ID, productId: PRODUCT_ID, name: "Cây", price: 3200, createdAt: NOW }),
    ],
  });
}
