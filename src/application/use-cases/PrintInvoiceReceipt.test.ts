import { describe, expect, it } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { Clock } from "../ports/Clock";
import { PrinterService } from "../ports/PrinterService";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { MarkInvoicePrinted } from "./MarkInvoicePrinted";
import { PrintInvoiceReceipt } from "./PrintInvoiceReceipt";

const NOW = "2026-09-24T00:00:00.000Z";
const INVOICE_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000001";

const clock: Clock = { now: () => NOW };

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
  const markPrinted = new MarkInvoicePrinted(repo);
  return new PrintInvoiceReceipt(repo, printer, markPrinted, clock);
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
    const found = await repo.findById(INVOICE_ID);
    if (found.ok && found.value) expect(found.value.isPrinted).toBe(false);
  });

  it("marks invoice as printed and returns ok on success", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice()]);
    const result = await makeUseCase(repo, okPrinter).execute(INVOICE_ID);
    expect(result.ok).toBe(true);
    const found = await repo.findById(INVOICE_ID);
    if (found.ok && found.value) expect(found.value.isPrinted).toBe(true);
  });

  it("returns repository_error when DB fails", async () => {
    const repo = new InMemoryInvoiceRepository([makeCompletedInvoice()]);
    repo.failNext("get", "disk error");
    const result = await makeUseCase(repo, okPrinter).execute(INVOICE_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("repository_error");
  });
});
