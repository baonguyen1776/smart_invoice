import { describe, expect, it, vi } from "vitest";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { SQLiteProductRepository, type CommandInvoker } from "./SQLiteProductRepository";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-01-01T00:00:00.000Z";

function makeProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: "SKU-1",
    name: "Coca Cola",
    brand: null,
    category: "Drink",
    createdAt: NOW,
    units: [
      Unit.create({
        id: UNIT_ID,
        productId: PRODUCT_ID,
        name: "Can",
        price: 10_000,
        createdAt: NOW,
      }),
    ],
  });
}

describe("SQLiteProductRepository", () => {
  it("sends a persistence DTO without leaking a database row into Domain", async () => {
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue(undefined);
    const repository = new SQLiteProductRepository(commandInvoker);

    const result = await repository.create(makeProduct());

    expect(result.ok).toBe(true);
    expect(commandInvoker).toHaveBeenCalledWith("create_product", {
      product: expect.objectContaining({
        id: PRODUCT_ID,
        isActive: true,
        units: [expect.objectContaining({ id: UNIT_ID, productId: PRODUCT_ID })],
      }),
    });
  });

  it("rehydrates Product and owned Units returned by the command", async () => {
    const product = makeProduct();
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      units: product.units,
    });
    const repository = new SQLiteProductRepository(commandInvoker);

    const result = await repository.findById(PRODUCT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Product);
    expect(result.value?.units[0]).toBeInstanceOf(Unit);
  });

  it("maps duplicate SKU and database errors to Application errors", async () => {
    const conflictInvoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue({ code: "sku_conflict", sku: "SKU-1" });
    const failureInvoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue({ code: "persistence", message: "database locked" });

    const conflict = await new SQLiteProductRepository(conflictInvoker).create(makeProduct());
    const failure = await new SQLiteProductRepository(failureInvoker).list("active");

    expect(conflict).toEqual({ ok: false, error: { code: "sku_conflict", sku: "SKU-1" } });
    expect(failure).toEqual({
      ok: false,
      error: { code: "persistence", operation: "list", message: "Database list operation failed." },
    });
  });

  it("returns null only for absent products and reports corrupt aggregates safely", async () => {
    const invoker = vi
      .fn<CommandInvoker>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...makeProduct(), units: [] });
    const repository = new SQLiteProductRepository(invoker);
    expect(await repository.findById(PRODUCT_ID)).toEqual({ ok: true, value: null });
    expect(await repository.findById(PRODUCT_ID)).toEqual({
      ok: false,
      error: { code: "persistence", operation: "get", message: "Database get operation failed." },
    });
  });

  it("keeps transport/driver diagnostics outside Application results", async () => {
    const invoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue(new Error("SELECT * FROM private_rows"));
    const repository = new SQLiteProductRepository(invoker);
    for (const result of [
      await repository.update(makeProduct()),
      await repository.deactivate(makeProduct()),
      await repository.reactivate(makeProduct()),
    ]) {
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("private_rows");
    }
  });

  it("sends reactivate_product command with mapped record DTO", async () => {
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue(undefined);
    const repository = new SQLiteProductRepository(commandInvoker);

    const result = await repository.reactivate(makeProduct());

    expect(result.ok).toBe(true);
    expect(commandInvoker).toHaveBeenCalledWith("reactivate_product", {
      product: expect.objectContaining({ id: PRODUCT_ID }),
    });
  });
});
