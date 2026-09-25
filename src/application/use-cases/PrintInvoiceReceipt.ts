import type { PrinterService, PrintFailure } from "../ports/PrinterService";
import type { InvoiceRepository } from "../repositories/InvoiceRepository";
import type { MarkInvoicePrinted } from "./MarkInvoicePrinted";
import type { Clock } from "../ports/Clock";

export type PrintReceiptFailure =
  | { readonly kind: "not_found" }
  | { readonly kind: "draft_not_printable" }
  | { readonly kind: "repository_error" }
  | { readonly kind: "unknown"; readonly message: string }
  | PrintFailure;

export type PrintReceiptResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: PrintReceiptFailure };

export class PrintInvoiceReceipt {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly printer: PrinterService,
    private readonly markPrinted: MarkInvoicePrinted,
    private readonly clock: Clock,
  ) {}

  async execute(invoiceId: string): Promise<PrintReceiptResult> {
    const findResult = await this.invoiceRepository.findById(invoiceId);
    if (!findResult.ok) {
      return { ok: false, failure: { kind: "repository_error" } };
    }

    if (findResult.value == null) {
      return { ok: false, failure: { kind: "not_found" } };
    }

    const invoice = findResult.value;
    if (invoice.status !== "completed") {
      return { ok: false, failure: { kind: "draft_not_printable" } };
    }

    const printResult = await this.printer.print();
    if (!printResult.ok) {
      return { ok: false, failure: printResult.failure };
    }

    await this.markPrinted.execute({
      invoiceId,
      printedAt: this.clock.now(),
    });

    return { ok: true };
  }
}
