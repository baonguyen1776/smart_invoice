import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoicePersistenceFailure } from "../errors/InvoiceError";
import type { Result } from "../shared/Result";

export interface CreateDraftPersistenceInput {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * Every write method represents one atomic persistence transaction.
 * Implementations map raw storage errors before returning to Application.
 */
export interface InvoiceRepository {
  createDraft(
    input: CreateDraftPersistenceInput,
  ): Promise<Result<Invoice, InvoicePersistenceFailure>>;
  findById(invoiceId: string): Promise<Result<Invoice | null, InvoicePersistenceFailure>>;
  listInvoices(
    status?: Invoice["status"],
  ): Promise<Result<readonly Invoice[], InvoicePersistenceFailure>>;
  saveDraft(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
  complete(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
  overwriteCompleted(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
  deleteDraft(invoiceId: string): Promise<Result<void, InvoicePersistenceFailure>>;
  markPrinted(
    invoiceId: string,
    printedAt: string,
  ): Promise<Result<void, InvoicePersistenceFailure>>;
}
