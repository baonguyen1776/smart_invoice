import { describe, expect, it } from "vitest";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import { ApplyInvoiceItemChange } from "./ApplyInvoiceItemChange";
import { CompleteInvoice } from "./CompleteInvoice";
import { CreateInvoiceDraft } from "./CreateInvoiceDraft";
import { OverwriteCompletedInvoice } from "./OverwriteCompletedInvoice";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";

const INVOICE_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "30000000-0000-4000-8000-000000000001";
const UNIT_ID = "40000000-0000-4000-8000-000000000001";
const NOW = "2026-09-10T01:00:00.000Z";

const clock: Clock = { now: () => NOW };
const ids: IdGenerator = { generate: () => ITEM_ID };

function draft(withItem = false): Invoice {
  const invoice = Invoice.createDraft({ id: INVOICE_ID, invoiceNumber: 7, createdAt: NOW });
  return withItem ? invoice.replaceDraftItems([line()], NOW) : invoice;
}

function line(id = ITEM_ID): InvoiceItem {
  return InvoiceItem.create({
    id,
    invoiceId: INVOICE_ID,
    productId: PRODUCT_ID,
    unitId: UNIT_ID,
    productName: "Coca Cola",
    productSku: null,
    productBrand: "Coca Cola",
    unitName: "Lon",
    unitPrice: 12_000,
    quantity: 2,
    createdAt: NOW,
  });
}

describe("Invoice use cases", () => {
  it("creates and immediately persists an empty numbered draft atomically", async () => {
    const repository = new InMemoryInvoiceRepository([], 18);
    const result = await new CreateInvoiceDraft(
      repository,
      { generate: () => INVOICE_ID },
      clock,
    ).execute();

    expect(result.ok && result.value).toMatchObject({
      invoiceNumber: 18,
      status: "draft",
      items: [],
    });
    expect(repository.createDraftCalls).toEqual([{ id: INVOICE_ID, createdAt: NOW }]);
  });

  it("adds, reprices, requantifies, and removes items as semantic draft writes", async () => {
    const repository = new InMemoryInvoiceRepository([draft()]);
    const useCase = new ApplyInvoiceItemChange(repository, ids, clock);
    const add = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: {
        type: "add",
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        productName: "Coca Cola",
        productSku: null,
        productBrand: null,
        unitName: "Lon",
        unitPrice: 12_000,
        quantity: 2,
      },
    });
    expect(add.ok && add.value.total).toBe(24_000);

    const quantity = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: { type: "update_quantity", itemId: ITEM_ID, quantity: 3 },
    });
    expect(quantity.ok && quantity.value.total).toBe(36_000);

    const price = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: { type: "update_price", itemId: ITEM_ID, unitPrice: 10_000 },
    });
    expect(price.ok && price.value.total).toBe(30_000);

    const remove = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: { type: "remove", itemId: ITEM_ID },
    });
    expect(remove.ok && remove.value.items).toEqual([]);
    expect(repository.saveDraftCalls).toHaveLength(4);
  });

  it("returns typed errors without a write for missing items and unsafe money", async () => {
    const repository = new InMemoryInvoiceRepository([draft()]);
    const useCase = new ApplyInvoiceItemChange(repository, ids, clock);
    const missing = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: { type: "remove", itemId: ITEM_ID },
    });
    const unsafe = await useCase.execute({
      invoiceId: INVOICE_ID,
      change: {
        type: "add",
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        productName: "Coca Cola",
        productSku: null,
        productBrand: null,
        unitName: "Lon",
        unitPrice: Number.MAX_SAFE_INTEGER,
        quantity: 2,
      },
    });

    expect(missing).toMatchObject({ ok: false, error: { code: "item_not_found" } });
    expect(unsafe).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(repository.saveDraftCalls).toHaveLength(0);
  });

  it("completes a non-empty draft through the atomic completion operation", async () => {
    const repository = new InMemoryInvoiceRepository([draft(true)]);
    const result = await new CompleteInvoice(repository, clock).execute({ invoiceId: INVOICE_ID });

    expect(result.ok && result.value.status).toBe("completed");
    expect(repository.completeCalls).toHaveLength(1);
  });

  it("rejects completion of an empty draft before persistence", async () => {
    const repository = new InMemoryInvoiceRepository([draft()]);
    const result = await new CompleteInvoice(repository, clock).execute({ invoiceId: INVOICE_ID });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_state" } });
    expect(repository.completeCalls).toHaveLength(0);
  });

  it("requires confirmation and preserves completed identity during atomic overwrite", async () => {
    const completed = draft(true).complete(NOW);
    const repository = new InMemoryInvoiceRepository([completed]);
    const useCase = new OverwriteCompletedInvoice(repository, clock);
    const denied = await useCase.execute({
      invoiceId: INVOICE_ID,
      confirmed: false,
      items: [line("20000000-0000-4000-8000-000000000002")],
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "confirmation_required" } });
    expect(repository.overwriteCompletedCalls).toHaveLength(0);

    const accepted = await useCase.execute({
      invoiceId: INVOICE_ID,
      confirmed: true,
      items: [line("20000000-0000-4000-8000-000000000002")],
    });
    expect(accepted.ok && accepted.value).toMatchObject({
      id: completed.id,
      invoiceNumber: completed.invoiceNumber,
      createdAt: completed.createdAt,
      completedAt: completed.completedAt,
      status: "completed",
    });
    expect(repository.overwriteCompletedCalls).toHaveLength(1);
  });

  it("maps repository failures with operation context", async () => {
    const repository = new InMemoryInvoiceRepository([draft(true)]);
    repository.failNext("complete", "disk full");
    const result = await new CompleteInvoice(repository, clock).execute({ invoiceId: INVOICE_ID });

    expect(result).toEqual({
      ok: false,
      error: { code: "persistence", operation: "complete", message: "disk full" },
    });
  });
});

it("persists discounts across completion without losing snapshots", async () => {
  const repository = new InMemoryInvoiceRepository([draft(true)]);
  const edit = new ApplyInvoiceItemChange(repository, ids, clock);
  const result = await edit.execute({ invoiceId: INVOICE_ID, change: { type: "update", itemId: ITEM_ID, values: { discountBasisPoints: 1250 } } });
  expect(result.ok && result.value.total).toBe(21000);
  expect(result.ok && result.value.items[0].productName).toBe("Coca Cola");
  const completed = await new CompleteInvoice(repository, clock).execute({ invoiceId: INVOICE_ID });
  expect(completed.ok && completed.value.total).toBe(21000);
  const loaded = await repository.findById(INVOICE_ID);
  expect(loaded.ok && loaded.value?.items[0].discountBasisPoints).toBe(1250);
});
