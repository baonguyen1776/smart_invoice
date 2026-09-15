import { expect, it } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { UpdateInvoiceOldDebt } from "./UpdateInvoiceOldDebt";
import { UpdateInvoiceCustomer } from "./UpdateInvoiceCustomer";
import { CompleteInvoice } from "./CompleteInvoice";
import { OverwriteCompletedInvoice } from "./OverwriteCompletedInvoice";
const now = "2026-09-14T01:00:00.000Z";
function setup() {
  const invoice = Invoice.createDraft({
    id: crypto.randomUUID(),
    invoiceNumber: 1,
    createdAt: now,
  });
  const item = InvoiceItem.create({
    id: crypto.randomUUID(),
    invoiceId: invoice.id,
    productId: crypto.randomUUID(),
    unitId: crypto.randomUUID(),
    productName: "Coffee",
    productSku: null,
    productBrand: null,
    unitName: "Can",
    quantity: 1,
    unitPrice: 10000,
    createdAt: now,
  });
  const repository = new InMemoryInvoiceRepository([invoice.replaceDraftItems([item], now)]);
  return {
    invoice,
    item,
    repository,
    update: new UpdateInvoiceOldDebt(repository, { now: () => now }),
  };
}
it("saves debt independently and serializes it with customer edits", async () => {
  const { invoice, repository, update } = setup();
  const results = await Promise.all([
    update.execute({ invoiceId: invoice.id, oldDebt: 25000 }),
    new UpdateInvoiceCustomer(repository, { now: () => now }).execute({
      invoiceId: invoice.id,
      customer: { name: "Customer" },
    }),
  ]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(await repository.findById(invoice.id)).toMatchObject({
    value: { oldDebt: 25000, customerName: "Customer", total: 10000 },
  });
});
it("validates debt, retains persisted values on failure, and permits retry/clearing", async () => {
  const { invoice, repository, update } = setup();
  expect(await update.execute({ invoiceId: invoice.id, oldDebt: -1 })).toMatchObject({
    ok: false,
    error: { code: "validation" },
  });
  repository.failNext("save_draft", "locked");
  expect(await update.execute({ invoiceId: invoice.id, oldDebt: 1000 })).toMatchObject({
    ok: false,
  });
  expect(await repository.findById(invoice.id)).toMatchObject({ value: { oldDebt: 0 } });
  expect(await update.execute({ invoiceId: invoice.id, oldDebt: 1000 })).toMatchObject({
    value: { oldDebt: 1000 },
  });
  expect(await update.execute({ invoiceId: invoice.id, oldDebt: 0 })).toMatchObject({
    value: { oldDebt: 0 },
  });
});
it("retains debt on completion and allows changes only through confirmed overwrite", async () => {
  const { invoice, item, repository, update } = setup();
  const complete = new CompleteInvoice(repository, { now: () => now });
  expect(await complete.execute({ invoiceId: invoice.id, oldDebt: 5000 })).toMatchObject({
    value: { oldDebt: 5000, total: 10000, finalTotal: 15000 },
  });
  expect(await update.execute({ invoiceId: invoice.id, oldDebt: 1000 })).toMatchObject({
    error: { code: "invalid_state" },
  });
  const overwrite = new OverwriteCompletedInvoice(repository, { now: () => now });
  expect(
    await overwrite.execute({
      invoiceId: invoice.id,
      confirmed: false,
      items: [item],
      oldDebt: 1000,
    }),
  ).toMatchObject({ error: { code: "confirmation_required" } });
  expect(
    await overwrite.execute({
      invoiceId: invoice.id,
      confirmed: true,
      items: [item],
      oldDebt: 1000,
    }),
  ).toMatchObject({ value: { oldDebt: 1000, finalTotal: 11000 } });
});
it("validates the final item/debt combination atomically during overwrite", async () => {
  const { invoice, item, repository } = setup();
  await new CompleteInvoice(repository, { now: () => now }).execute({
    invoiceId: invoice.id,
    oldDebt: 5000,
  });
  const maxItem = item.update({ unitPrice: Number.MAX_SAFE_INTEGER });
  const result = await new OverwriteCompletedInvoice(repository, { now: () => now }).execute({
    invoiceId: invoice.id,
    confirmed: true,
    items: [maxItem],
    oldDebt: 0,
  });
  expect(result).toMatchObject({ ok: true, value: { oldDebt: 0, total: Number.MAX_SAFE_INTEGER } });
});
