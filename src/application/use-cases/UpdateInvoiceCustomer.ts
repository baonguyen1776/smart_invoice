import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import { loadInvoice, mapInvoiceDomainError, serializeDraftChange } from "./InvoiceUseCaseSupport";

export interface UpdateInvoiceCustomerInput {
  readonly invoiceId: string;
  readonly customer: Parameters<Invoice["withCustomer"]>[0];
}

export class UpdateInvoiceCustomer {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  execute(input: UpdateInvoiceCustomerInput): Promise<Result<Invoice, InvoiceError>> {
    return serializeDraftChange(this.repository, input.invoiceId, () => this.update(input));
  }

  private async update(input: UpdateInvoiceCustomerInput): Promise<Result<Invoice, InvoiceError>> {
    const loaded = await loadInvoice(this.repository, input.invoiceId);
    if (!loaded.ok) return loaded;
    if (loaded.value.status !== "draft") {
      return err({
        code: "invalid_state",
        message: "Completed customer edits require confirmed overwrite.",
      });
    }
    try {
      const invoice = loaded.value.withCustomer(input.customer, this.clock.now());
      const saved = await this.repository.saveDraft(invoice);
      return saved.ok ? ok(invoice) : saved;
    } catch (error) {
      return err(mapInvoiceDomainError(error));
    }
  }
}
