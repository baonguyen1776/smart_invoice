import { describe, expect, it } from "vitest";
import { InvoiceItem, InvoiceItemValidationError } from "./InvoiceItem";

const ITEM_ID = "20000000-0000-4000-8000-000000000001";
const INVOICE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "30000000-0000-4000-8000-000000000001";
const UNIT_ID = "40000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-09-10T01:00:00.000Z";

function validInput() {
  return {
    id: ITEM_ID,
    invoiceId: INVOICE_ID,
    productId: PRODUCT_ID,
    unitId: UNIT_ID,
    productName: "  Coca Cola  ",
    productSku: "  COKE-330  ",
    productBrand: null,
    unitName: "  Lon  ",
    unitPrice: 12_000,
    quantity: 3,
    createdAt: CREATED_AT,
  };
}

describe("InvoiceItem", () => {
  it("captures normalized transaction snapshots and calculates its subtotal", () => {
    const item = InvoiceItem.create(validInput());

    expect(item).toMatchObject({
      productName: "Coca Cola",
      productSku: "COKE-330",
      productBrand: null,
      unitName: "Lon",
      unitPrice: 12_000,
      quantity: 3,
      subtotal: 36_000,
    });
  });

  it.each([
    ["id", { id: "not-a-uuid" }],
    ["invoiceId", { invoiceId: "not-a-uuid" }],
    ["productId", { productId: "not-a-uuid" }],
    ["unitId", { unitId: "not-a-uuid" }],
    ["productName", { productName: "   " }],
    ["productSku", { productSku: "   " }],
    ["productBrand", { productBrand: "   " }],
    ["unitName", { unitName: "   " }],
    ["unitPrice", { unitPrice: -1 }],
    ["unitPrice", { unitPrice: 1.5 }],
    ["quantity", { quantity: 0 }],
    ["quantity", { quantity: 1.5 }],
    ["createdAt", { createdAt: "yesterday" }],
  ])("rejects an invalid %s", (_field, override) => {
    expect(() => InvoiceItem.create({ ...validInput(), ...override })).toThrow(
      InvoiceItemValidationError,
    );
  });

  it("rejects multiplication beyond the safe-integer money range", () => {
    expect(() =>
      InvoiceItem.create({
        ...validInput(),
        unitPrice: Number.MAX_SAFE_INTEGER,
        quantity: 2,
      }),
    ).toThrow(/safe integer/i);
  });

  it("updates quantity or transaction price without changing snapshots", () => {
    const original = InvoiceItem.create(validInput());
    const repriced = original.update({ quantity: 4, unitPrice: 10_000 });

    expect(repriced).toMatchObject({
      id: original.id,
      productName: original.productName,
      productSku: original.productSku,
      unitName: original.unitName,
      quantity: 4,
      unitPrice: 10_000,
      subtotal: 40_000,
    });
  });
});

it("defaults historical lines to no discount and persists/recalculates discount edits", () => {
  const original = InvoiceItem.create(validInput());
  expect(original.discountBasisPoints).toBe(0);
  const discounted = original.update({ unitPrice: 105, quantity: 1, discountBasisPoints: 1000 });
  expect(discounted.discountAmount).toBe(11);
  expect(discounted.payment).toBe(94);
  const restored = InvoiceItem.rehydrate(discounted.toState());
  expect(restored.update({ quantity: 2 }).discountAmount).toBe(21);
  expect(restored.discountBasisPoints).toBe(1000);
  expect(() => restored.update({ discountBasisPoints: 10001 })).toThrow(InvoiceItemValidationError);
});
