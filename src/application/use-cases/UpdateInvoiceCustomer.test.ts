import { describe, expect, it } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { ApplyInvoiceItemChange } from "./ApplyInvoiceItemChange";
import { UpdateInvoiceCustomer } from "./UpdateInvoiceCustomer";

const now = "2026-09-10T01:00:00.000Z";
const later = "2026-09-10T02:00:00.000Z";
function draft() {
  return Invoice.createDraft({ id: crypto.randomUUID(), invoiceNumber: 1, createdAt: now });
}

describe("UpdateInvoiceCustomer", () => {
  it("persists and clears customer fields independently of item edits", async () => {
    const invoice = draft();
    const repository = new InMemoryInvoiceRepository([invoice]);
    const useCase = new UpdateInvoiceCustomer(repository, { now: () => later });
    expect(
      await useCase.execute({
        invoiceId: invoice.id,
        customer: { name: "Customer", address: "Address" },
      }),
    ).toMatchObject({ ok: true });
    expect(await repository.findById(invoice.id)).toMatchObject({
      ok: true,
      value: { customerName: "Customer", customerAddress: "Address", updatedAt: later, items: [] },
    });
    expect(
      await useCase.execute({ invoiceId: invoice.id, customer: { name: null, address: null } }),
    ).toMatchObject({ ok: true });
    expect(await repository.findById(invoice.id)).toMatchObject({
      ok: true,
      value: { customerName: null, customerAddress: null },
    });
  });

  it("requires the confirmed overwrite workflow for completed invoices", async () => {
    const invoice = draft();
    const item = InvoiceItem.create({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      productId: crypto.randomUUID(),
      unitId: crypto.randomUUID(),
      productName: "Coffee",
      productSku: null,
      productBrand: null,
      unitName: "Can",
      unitPrice: 1000,
      quantity: 1,
      createdAt: now,
    });
    const completed = invoice.replaceDraftItems([item], now).complete(now);
    const repository = new InMemoryInvoiceRepository([completed]);
    expect(
      await new UpdateInvoiceCustomer(repository, { now: () => later }).execute({
        invoiceId: invoice.id,
        customer: { name: "Changed" },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_state" } });
    expect(repository.saveDraftCalls).toHaveLength(0);
  });

  it("retains the previous customer after persistence failure and permits retry", async () => {
    const invoice = draft().withCustomer({ name: "Original" }, now);
    const repository = new InMemoryInvoiceRepository([invoice]);
    const useCase = new UpdateInvoiceCustomer(repository, { now: () => later });
    const input = { invoiceId: invoice.id, customer: { name: "Updated" } };
    repository.failNext("save_draft", "locked");
    expect(await useCase.execute(input)).toMatchObject({
      ok: false,
      error: { code: "persistence" },
    });
    expect(await repository.findById(invoice.id)).toMatchObject({
      ok: true,
      value: { customerName: "Original" },
    });
    expect(await useCase.execute(input)).toMatchObject({
      ok: true,
      value: { customerName: "Updated" },
    });
  });
});

it("serializes customer and item edits across use-case instances sharing a repository", async () => {
  const invoice = draft();
  const item = InvoiceItem.create({
    id: crypto.randomUUID(),
    invoiceId: invoice.id,
    productId: crypto.randomUUID(),
    unitId: crypto.randomUUID(),
    productName: "Coffee",
    productSku: null,
    productBrand: null,
    unitName: "Can",
    unitPrice: 1000,
    quantity: 1,
    createdAt: now,
  });
  const repository = new InMemoryInvoiceRepository([invoice.replaceDraftItems([item], now)]);
  const clock = { now: () => later };
  const ids = { generate: () => crypto.randomUUID() };
  const results = await Promise.all([
    new ApplyInvoiceItemChange(repository, ids, clock).execute({
      invoiceId: invoice.id,
      change: { type: "update_quantity", itemId: item.id, quantity: 5 },
    }),
    new UpdateInvoiceCustomer(repository, clock).execute({
      invoiceId: invoice.id,
      customer: { name: "Customer" },
    }),
    new ApplyInvoiceItemChange(repository, ids, clock).execute({
      invoiceId: invoice.id,
      change: { type: "update_price", itemId: item.id, unitPrice: 2500 },
    }),
  ]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(await repository.findById(invoice.id)).toMatchObject({
    ok: true,
    value: { customerName: "Customer", total: 12500, items: [{ quantity: 5, unitPrice: 2500 }] },
  });
});
