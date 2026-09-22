import { describe, expect, it, vi } from "vitest";
import { Product } from "../../domain/entities/Product";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import { Unit } from "../../domain/entities/Unit";
import { SQLiteProductImportRepository } from "./SQLiteProductImportRepository";
import type { CommandInvoker } from "./SQLiteProductRepository";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const ALIAS_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-20T00:00:00.000Z";

describe("SQLiteProductImportRepository", () => {
  it("sends one atomic import command containing products, units, and aliases", async () => {
    const invoker = vi.fn<CommandInvoker>().mockResolvedValue(undefined);
    const product = makeProduct();
    const alias = ProductAlias.create({
      id: ALIAS_ID,
      productId: PRODUCT_ID,
      alias: "TL027-H",
      sourceKey: "kiotviet",
      unitName: "Hộp",
      createdAt: NOW,
    });

    const result = await new SQLiteProductImportRepository(invoker).apply([
      { kind: "create", product, aliases: [alias] },
    ]);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(invoker).toHaveBeenCalledWith("import_products", {
      changes: [
        expect.objectContaining({
          kind: "create",
          product: expect.objectContaining({ id: PRODUCT_ID, units: [expect.any(Object)] }),
          aliases: [expect.objectContaining({ alias: "TL027-H", unitName: "Hộp" })],
        }),
      ],
    });
  });

  it("maps command conflicts without leaking transport diagnostics", async () => {
    const skuInvoker = vi.fn<CommandInvoker>().mockRejectedValue({
      code: "sku_conflict",
      sku: "TL027",
    });
    const aliasInvoker = vi.fn<CommandInvoker>().mockRejectedValue({
      code: "alias_conflict",
      alias: "TL027-H",
    });
    const failureInvoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue(new Error("INSERT INTO private_table"));

    expect(
      await new SQLiteProductImportRepository(skuInvoker).apply([
        { kind: "create", product: makeProduct(), aliases: [] },
      ]),
    ).toEqual({ ok: false, error: { code: "sku_conflict", sku: "TL027" } });
    expect(
      await new SQLiteProductImportRepository(aliasInvoker).apply([
        { kind: "create", product: makeProduct(), aliases: [] },
      ]),
    ).toEqual({ ok: false, error: { code: "alias_conflict", alias: "TL027-H" } });
    const failure = await new SQLiteProductImportRepository(failureInvoker).apply([
      { kind: "create", product: makeProduct(), aliases: [] },
    ]);
    expect(failure).toEqual({
      ok: false,
      error: {
        code: "persistence",
        operation: "import",
        message: "Database import operation failed.",
      },
    });
    expect(JSON.stringify(failure)).not.toContain("private_table");
  });
});

function makeProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: "TL027",
    name: "Bút bi TL027",
    brand: "Thiên Long",
    category: "Viết",
    createdAt: NOW,
    units: [
      Unit.create({ id: UNIT_ID, productId: PRODUCT_ID, name: "Cây", price: 3500, createdAt: NOW }),
    ],
  });
}
