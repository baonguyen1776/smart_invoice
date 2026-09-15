import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceItem } from "../../domain/entities/InvoiceItem";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import { loadInvoice, mapInvoiceDomainError } from "./InvoiceUseCaseSupport";

export interface OverwriteCompletedInvoiceInput {
  readonly invoiceId: string;
  readonly oldDebt?: number;
  readonly confirmed: boolean;
  readonly items: readonly InvoiceItem[];
  readonly customer?: {
    readonly name?: string | null;
    readonly phone?: string | null;
    readonly address?: string | null;
    readonly note?: string | null;
  };
}

export class OverwriteCompletedInvoice {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: OverwriteCompletedInvoiceInput): Promise<Result<Invoice, InvoiceError>> {
    if (!input.confirmed) return err({ code: "confirmation_required" });

    const loaded = await loadInvoice(this.repository, input.invoiceId);
    if (!loaded.ok) return loaded;

    try {
      const now = this.clock.now();
      let invoice = loaded.value;
      if (input.customer) {
        invoice = invoice.withCustomer(input.customer, now);
      }
      invoice = invoice.overwriteCompleted(input.items, now, input.oldDebt);
      const persisted = await this.repository.overwriteCompleted(invoice);
      return persisted.ok ? ok(invoice) : persisted;
    } catch (error) {
      return err(mapInvoiceDomainError(error));
    }
  }
}
