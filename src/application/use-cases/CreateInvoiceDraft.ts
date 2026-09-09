import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { Result } from "../shared/Result";

export class CreateInvoiceDraft {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<Invoice, InvoiceError>> {
    return this.repository.createDraft({
      id: this.idGenerator.generate(),
      createdAt: this.clock.now(),
    });
  }
}
