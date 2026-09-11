import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceError } from "../errors/InvoiceError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { Result } from "../shared/Result";

export interface RestoreInvoiceDraftInput {
  readonly preferredInvoiceId?: string;
}

export class RestoreInvoiceDraft {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input?: RestoreInvoiceDraftInput): Promise<Result<Invoice, InvoiceError>> {
    if (input?.preferredInvoiceId) {
      const existing = await this.repository.findById(input.preferredInvoiceId);
      if (!existing.ok) {
        return existing;
      }
      if (existing.value !== null && existing.value.status === "draft") {
        return { ok: true, value: existing.value };
      }
    }

    const draftsResult = await this.repository.listInvoices("draft");
    if (!draftsResult.ok) {
      return draftsResult;
    }

    if (draftsResult.value.length > 0) {
      return { ok: true, value: draftsResult.value[0] };
    }

    return this.repository.createDraft({
      id: this.idGenerator.generate(),
      createdAt: this.clock.now(),
    });
  }
}
