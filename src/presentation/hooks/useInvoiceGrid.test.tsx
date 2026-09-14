import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useInvoiceGrid, invoiceRowValues } from "./useInvoiceGrid";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";

it("acknowledging a saved row preserves other unfinished input", () => {
  const view = renderHook(
    ({ items }) =>
      useInvoiceGrid({
        items,
        onCommit: vi.fn(async () => null),
        onRemove: vi.fn(async () => null),
      }),
    { initialProps: { items: [] as InvoiceItem[] } },
  );
  const a = view.result.current.rows[0].id;
  act(() => view.result.current.change(a, { ...invoiceRowValues(), name: "First" }));
  const b = view.result.current.rows[1].id;
  act(() => view.result.current.change(b, { ...invoiceRowValues(), name: "Unfinished input" }));
  expect(view.result.current.rows.some((r) => r.id === b)).toBe(true);
  const item = InvoiceItem.create({
    id: a,
    invoiceId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    unitId: crypto.randomUUID(),
    productName: "First",
    productSku: null,
    productBrand: null,
    unitName: "Box",
    unitPrice: 10,
    quantity: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  view.rerender({ items: [item] });
  expect(view.result.current.rows.some((r) => r.id === b)).toBe(true);
});
