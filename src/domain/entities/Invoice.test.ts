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
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    });

    expect(invoice).toMatchObject({ status: "draft", total: 0, completedAt: null, items: [] });
  });

  it("recalculates total whenever draft items change", () => {
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    }).replaceDraftItems([item()], UPDATED_AT);

    expect(invoice.total).toBe(24_000);
    expect(invoice.updatedAt).toBe(UPDATED_AT);
  });

  it("rejects duplicate or foreign item identities", () => {
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    });
    const foreign = InvoiceItem.create({
      ...item().toState(),
      id: "20000000-0000-4000-8000-000000000002",
      invoiceId: "10000000-0000-4000-8000-000000000002",
    });

    expect(() => invoice.replaceDraftItems([item(), item()], UPDATED_AT)).toThrow(/unique/i);
    expect(() => invoice.replaceDraftItems([foreign], UPDATED_AT)).toThrow(/belong/i);
  });

  it("rejects an unsafe aggregate total", () => {
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    });
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

  it("allows invoices with return items and negative total", () => {
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    });
    const returnItem = item(ITEM_ID, 3700, -10);
    const updated = invoice.replaceDraftItems([returnItem], UPDATED_AT);
    expect(updated.total).toBe(-37000);
    const completed = updated.complete(COMPLETED_AT);
    expect(completed.status).toBe("completed");
    expect(completed.total).toBe(-37000);
  });

  it("overwrites a completed invoice while preserving its identity and completion time", () => {
    const completed = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 42,
      createdAt: CREATED_AT,
    })
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

  it("reconciles mismatched totals for drafts upon rehydration without throwing", () => {
    const draft = Invoice.rehydrate({
      id: INVOICE_ID,
      invoiceNumber: 1,
      status: "draft",
      total: 999_000,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      completedAt: null,
      items: [],
    });

    expect(draft.total).toBe(0);
  });

  it("rejects mismatched totals for completed invoices upon rehydration", () => {
    expect(() =>
      Invoice.rehydrate({
        id: INVOICE_ID,
        invoiceNumber: 1,
        status: "completed",
        total: 999_000,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        completedAt: COMPLETED_AT,
        items: [item()],
      }),
    ).toThrow(InvoiceValidationError);
  });

  it("creates draft with customer info and updates customer metadata via withCustomer", () => {
    const draft = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
      customerName: "Nguyễn Văn A",
      customerPhone: "0901234567",
      customerAddress: "Hà Nội",
      customerNote: "Giao gấp",
    });

    expect(draft.customerName).toBe("Nguyễn Văn A");
    expect(draft.customerPhone).toBe("0901234567");
    expect(draft.customerAddress).toBe("Hà Nội");
    expect(draft.customerNote).toBe("Giao gấp");
    expect(draft.isPrinted).toBe(false);
    expect(draft.printedAt).toBeNull();

    const updated = draft.withCustomer(
      {
        name: "Trần Thị B",
        phone: "0987654321",
        address: "TP.HCM",
        note: "Đã cọc",
      },
      UPDATED_AT,
    );

    expect(updated.customerName).toBe("Trần Thị B");
    expect(updated.customerPhone).toBe("0987654321");
    expect(updated.customerAddress).toBe("TP.HCM");
    expect(updated.customerNote).toBe("Đã cọc");
    expect(updated.updatedAt).toBe(UPDATED_AT);
  });

  it("updates print tracking status with markPrinted", () => {
    const invoice = Invoice.createDraft({
      id: INVOICE_ID,
      invoiceNumber: 1,
      createdAt: CREATED_AT,
    });

    expect(invoice.isPrinted).toBe(false);
    expect(invoice.printedAt).toBeNull();

    const printed = invoice.markPrinted(COMPLETED_AT);
    expect(printed.isPrinted).toBe(true);
    expect(printed.printedAt).toBe(COMPLETED_AT);
    expect(printed.updatedAt).toBe(COMPLETED_AT);
  });
});

describe("invoice old debt", () => {
  const draft = () =>
    Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 1, createdAt: CREATED_AT });
  it("defaults to zero and adds old debt after item discounts without changing the item total", () => {
    expect(draft().oldDebt).toBe(0);
    const invoice = draft()
      .replaceDraftItems([item().update({ discountBasisPoints: 1000 })], UPDATED_AT)
      .withOldDebt(5000, UPDATED_AT);
    expect(invoice.total).toBe(21600);
    expect(invoice.finalTotal).toBe(26600);
    expect(Invoice.rehydrate(invoice.toState()).oldDebt).toBe(5000);
    expect(invoice.complete(COMPLETED_AT).oldDebt).toBe(5000);
    expect(invoice.withOldDebt(0, UPDATED_AT).finalTotal).toBe(21600);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid old debt %s",
    (value) => {
      expect(() => draft().withOldDebt(value, UPDATED_AT)).toThrow(InvoiceValidationError);
    },
  );
  it("rejects unsafe combined totals and supports net credit after returns", () => {
    const invoice = draft().replaceDraftItems([item()], UPDATED_AT);
    expect(() => invoice.withOldDebt(Number.MAX_SAFE_INTEGER, UPDATED_AT)).toThrow(/Final total/);
    expect(
      draft()
        .replaceDraftItems([item(ITEM_ID, 1000, -10)], UPDATED_AT)
        .withOldDebt(2000, UPDATED_AT).finalTotal,
    ).toBe(-8000);
  });
});
