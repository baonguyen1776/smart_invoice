import type { Invoice, InvoiceStatus } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { Result } from "../shared/Result";

export interface ListInvoicesInput {
  readonly status?: InvoiceStatus;
}

export class ListInvoices {
  constructor(private readonly repository: InvoiceRepository) {}

  async execute(input?: ListInvoicesInput): Promise<Result<readonly Invoice[], InvoiceError>> {
    return this.repository.listInvoices(input?.status);
  }
}
