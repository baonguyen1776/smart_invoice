import { InvoiceValidationError } from "../../domain/entities/Invoice";
import { InvoiceItemValidationError } from "../../domain/entities/InvoiceItem";
import type { InvoiceError } from "../errors/InvoiceError";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import type { Invoice } from "../../domain/entities/Invoice";

export async function loadInvoice(
  repository: InvoiceRepository,
  invoiceId: string,
): Promise<Result<Invoice, InvoiceError>> {
  const result = await repository.findById(invoiceId);
  if (!result.ok) return result;
  return result.value === null ? err({ code: "not_found", invoiceId }) : ok(result.value);
}

export function mapInvoiceDomainError(error: unknown): InvoiceError {
  if (error instanceof InvoiceValidationError || error instanceof InvoiceItemValidationError) {
    const invalidState = /completed|at least one|only a completed/i.test(error.message);
    return { code: invalidState ? "invalid_state" : "validation", message: error.message };
  }

  return { code: "validation", message: "Invalid invoice data." };
}
