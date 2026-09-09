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
  saveDraft(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
  complete(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
  overwriteCompleted(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>>;
}
