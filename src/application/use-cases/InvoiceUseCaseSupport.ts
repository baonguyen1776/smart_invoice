import { InvoiceValidationError } from "../../domain/entities/Invoice";
import { InvoiceItemValidationError } from "../../domain/entities/InvoiceItem";
import type { InvoiceError } from "../errors/InvoiceError";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import { err, ok, type Result } from "../shared/Result";
import type { Invoice } from "../../domain/entities/Invoice";

const draftChanges = new WeakMap<InvoiceRepository, Map<string, Promise<unknown>>>();

// Editor sessions may unmount while saving. Serialize the full read/edit/write
// operation across those sessions, and release each queue when its final edit settles.
export function serializeDraftChange<T>(
  repository: InvoiceRepository,
  invoiceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let queues = draftChanges.get(repository);
  if (!queues) {
    queues = new Map();
    draftChanges.set(repository, queues);
  }
  const queue = queues;
  const previous = queue.get(invoiceId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  queue.set(invoiceId, current);
  const release = () => {
    if (queue.get(invoiceId) === current) queue.delete(invoiceId);
  };
  void current.then(release, release);
  return current;
}

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
