import { InvoiceItem, type UpdateInvoiceItemInput } from "../../domain/entities/InvoiceItem";
import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import { loadInvoice, mapInvoiceDomainError } from "./InvoiceUseCaseSupport";

interface AddItemChange {
  readonly type: "add";
  readonly itemId?: string;
  readonly discountBasisPoints?: number;
  readonly productId: string;
  readonly unitId: string;
  readonly productName: string;
  readonly productSku: string | null;
  readonly productBrand: string | null;
  readonly unitName: string;
  readonly unitPrice: number;
  readonly quantity: number;
}

interface RemoveItemChange {
  readonly type: "remove";
  readonly itemId: string;
}

interface UpdateQuantityChange {
  readonly type: "update_quantity";
  readonly itemId: string;
  readonly quantity: number;
}

interface UpdatePriceChange {
  readonly type: "update_price";
  readonly itemId: string;
  readonly unitPrice: number;
}

export type InvoiceItemChange =
  AddItemChange | RemoveItemChange | UpdateQuantityChange | UpdatePriceChange | { readonly type: "update"; readonly itemId: string; readonly values: UpdateInvoiceItemInput };

export interface ApplyInvoiceItemChangeInput {
  readonly invoiceId: string;
  readonly change: InvoiceItemChange;
}

class InvoiceItemMissingError extends Error {
  constructor(readonly itemId: string) {
    super("Invoice item was not found.");
  }
}

export class ApplyInvoiceItemChange {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ApplyInvoiceItemChangeInput): Promise<Result<Invoice, InvoiceError>> {
    const loaded = await loadInvoice(this.repository, input.invoiceId);
    if (!loaded.ok) return loaded;

    try {
      const now = this.clock.now();
      const items = this.applyChange(loaded.value, input.change, now);
      const invoice = loaded.value.replaceDraftItems(items, now);
      const saved = await this.repository.saveDraft(invoice);
      return saved.ok ? ok(invoice) : saved;
    } catch (error) {
      if (error instanceof InvoiceItemMissingError) {
        return err({ code: "item_not_found", itemId: error.itemId });
      }
      return err(mapInvoiceDomainError(error));
    }
  }

  private applyChange(
    invoice: Invoice,
    change: InvoiceItemChange,
    now: string,
  ): readonly InvoiceItem[] {
    if (change.type === "add") {
      return [
        ...invoice.items,
        InvoiceItem.create({
          id: change.itemId ?? this.idGenerator.generate(),
          discountBasisPoints: change.discountBasisPoints,
          invoiceId: invoice.id,
          productId: change.productId,
          unitId: change.unitId,
          productName: change.productName,
          productSku: change.productSku,
          productBrand: change.productBrand,
          unitName: change.unitName,
          unitPrice: change.unitPrice,
          quantity: change.quantity,
          createdAt: now,
        }),
      ];
    }

    const index = invoice.items.findIndex((item) => item.id === change.itemId);
    if (index < 0) throw new InvoiceItemMissingError(change.itemId);
    if (change.type === "remove")
      return invoice.items.filter((_, itemIndex) => itemIndex !== index);

    return invoice.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (change.type === "update") return item.update(change.values);
      return change.type === "update_quantity"
        ? item.update({ quantity: change.quantity })
        : item.update({ unitPrice: change.unitPrice });
    });
  }
}
