import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import { loadInvoice, mapInvoiceDomainError } from "./InvoiceUseCaseSupport";

export interface CompleteInvoiceInput {
  readonly invoiceId: string;
  readonly oldDebt?: number;
  readonly customer?: {
    readonly name?: string | null;
    readonly phone?: string | null;
    readonly address?: string | null;
    readonly note?: string | null;
  };
}

export class CompleteInvoice {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CompleteInvoiceInput): Promise<Result<Invoice, InvoiceError>> {
    const loaded = await loadInvoice(this.repository, input.invoiceId);
    if (!loaded.ok) return loaded;

    try {
      const now = this.clock.now();
      let invoice = loaded.value;
      if (input.customer) {
        invoice = invoice.withCustomer(input.customer, now);
      }
      invoice = invoice.complete(now);
      if (input.oldDebt !== undefined) invoice = invoice.withOldDebt(input.oldDebt, now);
      const persisted = await this.repository.complete(invoice);
      return persisted.ok ? ok(invoice) : persisted;
    } catch (error) {
      return err(mapInvoiceDomainError(error));
    }
  }
}
