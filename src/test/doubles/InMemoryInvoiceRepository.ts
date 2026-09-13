import { Invoice } from "../../domain/entities/Invoice";
import type {
  InvoicePersistenceFailure,
  InvoiceRepositoryOperation,
} from "../../application/errors/InvoiceError";
import type {
  CreateDraftPersistenceInput,
  InvoiceRepository,
} from "../../application/repositories/InvoiceRepository";
import { err, ok, type Result } from "../../application/shared/Result";

export class InMemoryInvoiceRepository implements InvoiceRepository {
  readonly createDraftCalls: CreateDraftPersistenceInput[] = [];
  readonly saveDraftCalls: Invoice[] = [];
  readonly completeCalls: Invoice[] = [];
  readonly overwriteCompletedCalls: Invoice[] = [];

  private readonly invoices = new Map<string, Invoice>();
  private readonly failures = new Map<InvoiceRepositoryOperation, InvoicePersistenceFailure>();

  constructor(
    initialInvoices: readonly Invoice[] = [],
    private nextInvoiceNumber = 1,
  ) {
    for (const invoice of initialInvoices) this.invoices.set(invoice.id, invoice);
  }

  failNext(operation: InvoiceRepositoryOperation, message: string): void {
    this.failures.set(operation, { code: "persistence", operation, message });
  }

  async createDraft(
    input: CreateDraftPersistenceInput,
  ): Promise<Result<Invoice, InvoicePersistenceFailure>> {
    this.createDraftCalls.push(input);
    const failure = this.takeFailure("create_draft");
    if (failure !== null) return err(failure);

    const invoice = Invoice.createDraft({ ...input, invoiceNumber: this.nextInvoiceNumber++ });
    this.invoices.set(invoice.id, invoice);
    return ok(invoice);
  }

  async findById(invoiceId: string): Promise<Result<Invoice | null, InvoicePersistenceFailure>> {
    const failure = this.takeFailure("get");
    return failure === null ? ok(this.invoices.get(invoiceId) ?? null) : err(failure);
  }

  async listInvoices(
    status?: Invoice["status"],
  ): Promise<Result<readonly Invoice[], InvoicePersistenceFailure>> {
    const failure = this.takeFailure("list");
    if (failure !== null) return err(failure);
    const all = Array.from(this.invoices.values());
    const filtered = status ? all.filter((inv) => inv.status === status) : all;
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return ok(filtered);
  }

  async saveDraft(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    this.saveDraftCalls.push(invoice);
    return this.persist("save_draft", invoice);
  }

  async complete(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    this.completeCalls.push(invoice);
    return this.persist("complete", invoice);
  }

  async overwriteCompleted(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    this.overwriteCompletedCalls.push(invoice);
    return this.persist("overwrite_completed", invoice);
  }

  async deleteDraft(invoiceId: string): Promise<Result<void, InvoicePersistenceFailure>> {
    const failure = this.takeFailure("delete_draft");
    if (failure !== null) return err(failure);
    this.invoices.delete(invoiceId);
    return ok(undefined);
  }

  async markPrinted(
    invoiceId: string,
    printedAt: string,
  ): Promise<Result<void, InvoicePersistenceFailure>> {
    const failure = this.takeFailure("mark_printed");
    if (failure !== null) return err(failure);
    const existing = this.invoices.get(invoiceId);
    if (existing) {
      this.invoices.set(invoiceId, existing.markPrinted(printedAt));
    }
    return ok(undefined);
  }

  private persist(
    operation: InvoiceRepositoryOperation,
    invoice: Invoice,
  ): Result<void, InvoicePersistenceFailure> {
    const failure = this.takeFailure(operation);
    if (failure !== null) return err(failure);
    this.invoices.set(invoice.id, invoice);
    return ok(undefined);
  }

  private takeFailure(operation: InvoiceRepositoryOperation): InvoicePersistenceFailure | null {
    const failure = this.failures.get(operation) ?? null;
    this.failures.delete(operation);
    return failure;
  }
}
