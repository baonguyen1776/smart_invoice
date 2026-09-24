import { describe, expect, it, vi } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { PrinterService } from "../ports/PrinterService";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { PrintInvoiceReceipt } from "./PrintInvoiceReceipt";

const NOW = "2026-09-24T00:00:00.000Z";
const INVOICE_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000001";

const okPrinter: PrinterService = {
  print: () => Promise.resolve({ ok: true }),
};

const failPrinter: PrinterService = {
  print: () =>
    Promise.resolve({
      ok: false,
      failure: { kind: "dialog_blocked" },
    }),
};

function makeItem(): InvoiceItem {
  return InvoiceItem.create({
    id: ITEM_ID,
    invoiceId: INVOICE_ID,
    productId: "30000000-0000-4000-8000-000000000001",
    unitId: "40000000-0000-4000-8000-000000000001",
    productName: "Coca Cola",
    productSku: null,
    productBrand: null,
    unitName: "Lon",
    unitPrice: 12_000,
    quantity: 1,
    createdAt: NOW,
  });
}

function makeDraftInvoice(): Invoice {
  return Invoice.createDraft({
    id: INVOICE_ID,
    invoiceNumber: 1,
    createdAt: NOW,
  });
}

function makeCompletedInvoice(): Invoice {
  return makeDraftInvoice().replaceDraftItems([makeItem()], NOW).complete(NOW);
}

function makeUseCase(repo: InMemoryInvoiceRepository, printer: PrinterService) {
  return new PrintInvoiceReceipt(repo, printer);
}

describe("PrintInvoiceReceipt", () => {
  it("returns not_found when invoice does not exist", async () => {
    const repo = new InMemoryInvoiceRepository();
    const result = await makeUseCase(repo, okPrinter).execute(INVOICE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("not_found");
  });

  it("returns draft_not_printable when invoice is a draft", async () => {
    const repo = new InMemoryInvoiceRepository([makeDraftInvoice()]);
    const result = await makeUseCase(repo, failPrinter).execute(INVOICE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("draft_not_printable");
    const found = await repo.findById(INVOICE_ID);
    if (found.ok && found.value) expect(found.value.isPrinted).toBe(false);
  });

  it("leaves invoice unprinted when the print dialog returns without confirmation", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice()]);
    const result = await makeUseCase(repo, okPrinter).execute(INVOICE_ID);
    expect(result.ok).toBe(true);
    const found = await repo.findById(INVOICE_ID);
    expect(found.ok && found.value?.isPrinted).toBe(false);
  });

  it("preserves an already printed invoice when opening another print dialog", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice().markPrinted(NOW)]);
    await makeUseCase(repo, okPrinter).execute(INVOICE_ID);
    const found = await repo.findById(INVOICE_ID);
    expect(found.ok && found.value?.printedAt).toBe(NOW);
  });

  it("returns printer errors without changing the invoice", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice()]);
    expect(await makeUseCase(repo, failPrinter).execute(INVOICE_ID)).toEqual({
      ok: false,
      failure: { kind: "dialog_blocked" },
    });
    const found = await repo.findById(INVOICE_ID);
    expect(found.ok && found.value?.isPrinted).toBe(false);
  });

  it("does not contact the printer for a draft", async () => {
    const print = vi.fn(okPrinter.print);
    const repo = new InMemoryInvoiceRepository([makeDraftInvoice()]);
    await makeUseCase(repo, { print }).execute(INVOICE_ID);
    expect(print).not.toHaveBeenCalled();
  });

  it("returns repository_error when DB fails", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice()]);
    repo.failNext("get", "disk error");
    const result = await makeUseCase(repo, okPrinter).execute(INVOICE_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("repository_error");
  });
});
