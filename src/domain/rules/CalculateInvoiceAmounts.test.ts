import { describe, expect, it } from "vitest";
import { calculateInvoiceLineAmounts, parseDiscountPercent, sumInvoiceAmounts } from "./CalculateInvoiceAmounts";

describe("Invoice discounts", () => {
  it("calculates gross, discount and payment with per-line half-up VND rounding", () => {
    const first = calculateInvoiceLineAmounts(1, 105, 1000);
    expect(first).toEqual({ subtotal: 105, discountAmount: 11, payment: 94 });
    expect(sumInvoiceAmounts([first, first])).toEqual({ subtotal: 210, discountAmount: 22, payment: 188 });
  });
  it("retains exact rounding at the largest supported VND amount", () => {
    expect(calculateInvoiceLineAmounts(1, Number.MAX_SAFE_INTEGER, 5000)).toEqual({
      subtotal: Number.MAX_SAFE_INTEGER, discountAmount: 4503599627370496, payment: 4503599627370495,
    });
  });
  it("supports zero/full discounts and free items", () => {
    expect(calculateInvoiceLineAmounts(3, 10, 0).payment).toBe(30);
    expect(calculateInvoiceLineAmounts(3, 10, 10000).payment).toBe(0);
    expect(calculateInvoiceLineAmounts(3, 0, 1234).payment).toBe(0);
  });
  it.each([-1, 10001, 1.5, NaN, Infinity])("rejects invalid persisted basis points %s", (value) => {
    expect(() => calculateInvoiceLineAmounts(1, 10, value)).toThrow();
  });
  it("rejects gross overflow even when a full discount would hide it", () => {
    expect(() => calculateInvoiceLineAmounts(2, Number.MAX_SAFE_INTEGER, 10000)).toThrow();
    const line = calculateInvoiceLineAmounts(1, Number.MAX_SAFE_INTEGER, 10000);
    expect(() => sumInvoiceAmounts([line, line])).toThrow();
  });
  it("parses exact percent precision with Vietnamese or decimal separators", () => {
    expect(parseDiscountPercent("12,50")).toBe(1250);
    expect(parseDiscountPercent("0.01")).toBe(1);
    expect(parseDiscountPercent("100.00")).toBe(10000);
    for (const value of ["1.234", "100.01", "-1", "1e1", "NaN"]) expect(() => parseDiscountPercent(value)).toThrow();
  });
});
