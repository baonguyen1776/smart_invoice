import { describe, expect, it, vi } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { SQLiteInvoiceRepository, type CommandInvoker } from "./SQLiteInvoiceRepository";

const INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const ITEM_ID = "77777777-7777-4777-8777-777777777777";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-01-01T00:00:00.000Z";

function makeItem(): InvoiceItem {
  return InvoiceItem.create({
    id: ITEM_ID,
    invoiceId: INVOICE_ID,
    productId: PRODUCT_ID,
    unitId: UNIT_ID,
    productName: "Coca Cola",
    productSku: "SKU-1",
    productBrand: null,
    unitName: "Can",
    unitPrice: 10_000,
    quantity: 2,
    createdAt: NOW,
  });
}

function makeDraft(): Invoice {
  return Invoice.createDraft({
    id: INVOICE_ID,
    invoiceNumber: 1,
    createdAt: NOW,
  });
}

describe("SQLiteInvoiceRepository", () => {
  it("invokes create_invoice_draft and rehydrates the created draft", async () => {
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 1,
      status: "draft",
      total: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      items: [],
    });
    const repository = new SQLiteInvoiceRepository(commandInvoker);

    const result = await repository.createDraft({ id: INVOICE_ID, createdAt: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Invoice);
    expect(result.value.invoiceNumber).toBe(1);
    expect(commandInvoker).toHaveBeenCalledWith("create_invoice_draft", {
      input: { id: INVOICE_ID, createdAt: NOW },
    });
  });

  it("rehydrates Invoice and owned snapshot InvoiceItems from findById", async () => {
    const item = makeItem();
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 1,
      status: "draft",
      total: 20_000,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      items: [
        {
          id: item.id,
          invoiceId: item.invoiceId,
          productId: item.productId,
          unitId: item.unitId,
          productName: item.productName,
          productSku: item.productSku,
          productBrand: item.productBrand,
          unitName: item.unitName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          createdAt: item.createdAt,
        },
      ],
    });
    const repository = new SQLiteInvoiceRepository(commandInvoker);

    const result = await repository.findById(INVOICE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Invoice);
    expect(result.value?.items[0]).toBeInstanceOf(InvoiceItem);
    expect(result.value?.total).toBe(20_000);
  });

  it("returns ok(null) when invoice is not found", async () => {
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue(null);
    const repository = new SQLiteInvoiceRepository(commandInvoker);

    const result = await repository.findById(INVOICE_ID);

    expect(result).toEqual({ ok: true, value: null });
  });

  it("sends serialized DTO on write operations", async () => {
    const commandInvoker = vi.fn<CommandInvoker>().mockResolvedValue(undefined);
    const repository = new SQLiteInvoiceRepository(commandInvoker);
    const draft = makeDraft().replaceDraftItems([makeItem()], NOW);

    await repository.saveDraft(draft);
    expect(commandInvoker).toHaveBeenCalledWith("save_invoice_draft", {
      invoice: expect.objectContaining({ id: INVOICE_ID, total: 20_000 }),
    });

    const completed = draft.complete(NOW);
    await repository.complete(completed);
    expect(commandInvoker).toHaveBeenCalledWith("complete_invoice", {
      invoice: expect.objectContaining({ status: "completed" }),
    });

    await repository.overwriteCompleted(completed);
    expect(commandInvoker).toHaveBeenCalledWith("overwrite_completed_invoice", {
      invoice: expect.objectContaining({ status: "completed" }),
    });
  });

  it("maps command rejections to persistence failures safely without leaking internals", async () => {
    const failureInvoker = vi.fn<CommandInvoker>().mockRejectedValue(new Error("SQLITE_LOCKED"));
    const repository = new SQLiteInvoiceRepository(failureInvoker);

    const result = await repository.createDraft({ id: INVOICE_ID, createdAt: NOW });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "persistence",
        operation: "create_draft",
        message: "Database create_draft operation failed.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("SQLITE_LOCKED");
  });
});

it("round-trips persisted discount basis points and net totals through the command DTO", async () => {
  const item = makeItem().update({ discountBasisPoints: 1250 });
  const invoice = makeDraft().replaceDraftItems([item], NOW);
  const invoker = vi.fn<CommandInvoker>().mockResolvedValue(undefined);
  const repository = new SQLiteInvoiceRepository(invoker);
  expect((await repository.saveDraft(invoice)).ok).toBe(true);
  const record = invoker.mock.calls[0][1]?.invoice;
  expect(record).toMatchObject({ total: 17500, items: [expect.objectContaining({ subtotal: 20000, discountBasisPoints: 1250 })] });
  invoker.mockResolvedValue(record);
  const restored = await repository.findById(INVOICE_ID);
  expect(restored.ok && restored.value?.items[0].discountAmount).toBe(2500);
  expect(restored.ok && restored.value?.total).toBe(17500);
});
