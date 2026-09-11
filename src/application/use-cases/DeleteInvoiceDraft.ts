import type { InvoiceError } from "../errors/InvoiceError";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { Result } from "../shared/Result";

export class DeleteInvoiceDraft {
  constructor(private readonly repository: InvoiceRepository) {}

  async execute(invoiceId: string): Promise<Result<void, InvoiceError>> {
    return this.repository.deleteDraft(invoiceId);
  }
}
