import type { InvoicePersistenceFailure } from "../errors/InvoiceError";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { Result } from "../shared/Result";

export interface MarkInvoicePrintedInput {
  readonly invoiceId: string;
  readonly printedAt?: string;
}

export class MarkInvoicePrinted {
  constructor(private readonly repository: InvoiceRepository) {}

  async execute(input: MarkInvoicePrintedInput): Promise<Result<void, InvoicePersistenceFailure>> {
    const printedAt = input.printedAt ?? new Date().toISOString();
    return this.repository.markPrinted(input.invoiceId, printedAt);
  }
}
