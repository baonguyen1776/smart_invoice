import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import { loadInvoice, mapInvoiceDomainError } from "./InvoiceUseCaseSupport";

export class CompleteInvoice {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { readonly invoiceId: string }): Promise<Result<Invoice, InvoiceError>> {
    const loaded = await loadInvoice(this.repository, input.invoiceId);
    if (!loaded.ok) return loaded;

    try {
      const invoice = loaded.value.complete(this.clock.now());
      const persisted = await this.repository.complete(invoice);
      return persisted.ok ? ok(invoice) : persisted;
    } catch (error) {
      return err(mapInvoiceDomainError(error));
    }
  }
}
