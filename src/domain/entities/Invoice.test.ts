import { describe, expect, it } from "vitest";
import { Invoice, InvoiceValidationError } from "./Invoice";
import { InvoiceItem } from "./InvoiceItem";

const INVOICE_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-09-10T01:00:00.000Z";
const UPDATED_AT = "2026-09-10T02:00:00.000Z";
const COMPLETED_AT = "2026-09-10T03:00:00.000Z";

function item(id = ITEM_ID, price = 12_000, quantity = 2): InvoiceItem {
  return InvoiceItem.create({
    id,
    invoiceId: INVOICE_ID,
    productId: "30000000-0000-4000-8000-000000000001",
    unitId: "40000000-0000-4000-8000-000000000001",
    productName: "Coca Cola",
    productSku: null,
    productBrand: "Coca Cola",
    unitName: "Lon",
    unitPrice: price,
    quantity,
    createdAt: CREATED_AT,
  });
}

describe("Invoice", () => {
  it("creates an empty draft with a positive invoice number", () => {
    const invoice = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT });

    expect(invoice).toMatchObject({ status: "draft", total: 0, completedAt: null, items: [] });
  });

  it("recalculates total whenever draft items change", () => {
    const invoice = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT })
      .replaceDraftItems([item()], UPDATED_AT);

    expect(invoice.total).toBe(24_000);
    expect(invoice.updatedAt).toBe(UPDATED_AT);
  });

  it("rejects duplicate or foreign item identities", () => {
    const invoice = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT });
    const foreign = InvoiceItem.create({
      ...item().toState(),
      id: "20000000-0000-4000-8000-000000000002",
      invoiceId: "10000000-0000-4000-8000-000000000002",
    });

    expect(() => invoice.replaceDraftItems([item(), item()], UPDATED_AT)).toThrow(/unique/i);
    expect(() => invoice.replaceDraftItems([foreign], UPDATED_AT)).toThrow(/belong/i);
  });

  it("rejects an unsafe aggregate total", () => {
    const invoice = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT });
    const first = item(ITEM_ID, Number.MAX_SAFE_INTEGER, 1);
    const second = item("20000000-0000-4000-8000-000000000002", 1, 1);

    expect(() => invoice.replaceDraftItems([first, second], UPDATED_AT)).toThrow(/safe integer/i);
  });

  it("requires an item to complete and never returns to draft", () => {
    const empty = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT });
    expect(() => empty.complete(COMPLETED_AT)).toThrow(/at least one/i);

    const completed = empty.replaceDraftItems([item()], UPDATED_AT).complete(COMPLETED_AT);
    expect(completed).toMatchObject({ status: "completed", completedAt: COMPLETED_AT });
    expect(() => completed.replaceDraftItems([], UPDATED_AT)).toThrow(/completed/i);
  });

  it("overwrites a completed invoice while preserving its identity and completion time", () => {
    const completed = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 42, createdAt: CREATED_AT })
      .replaceDraftItems([item()], UPDATED_AT)
      .complete(COMPLETED_AT);
    const replacement = item("20000000-0000-4000-8000-000000000002", 15_000, 3);
    const overwritten = completed.overwriteCompleted([replacement], "2026-09-10T04:00:00.000Z");

    expect(overwritten).toMatchObject({
      id: INVOICE_ID,
      invoiceNumber: 42,
      createdAt: CREATED_AT,
      completedAt: COMPLETED_AT,
      updatedAt: "2026-09-10T04:00:00.000Z",
      status: "completed",
      total: 45_000,
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid invoice number %s",
    (invoiceNumber) => {
      expect(() =>
        Invoice.createDraft({ id: INVOICE_ID, invoiceNumber, createdAt: CREATED_AT }),
      ).toThrow(InvoiceValidationError);
    },
  );
});
