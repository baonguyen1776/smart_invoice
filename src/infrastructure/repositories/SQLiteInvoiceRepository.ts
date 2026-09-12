import { invoke } from "@tauri-apps/api/core";
import type {
  InvoicePersistenceFailure,
  InvoiceRepositoryOperation,
} from "../../application/errors/InvoiceError";
import type {
  CreateDraftPersistenceInput,
  InvoiceRepository,
} from "../../application/repositories/InvoiceRepository";
import { err, ok, type Result } from "../../application/shared/Result";
import { Invoice, type InvoiceStatus } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";

// matching struct with InvoiceItemRecord at Rust
interface InvoiceItemRecord {
  readonly id: string;
  readonly invoiceId: string;
  readonly productId: string;
  readonly unitId: string;
  readonly productName: string;
  readonly productSku: string | null;
  readonly productBrand: string | null;
  readonly unitName: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
  readonly discountBasisPoints: number;
  readonly note: string | null;
  readonly createdAt: string;
}

// Matching DTO stuct with InvoiceRecord at Rust
interface InvoiceRecord {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly status: InvoiceStatus;
  readonly total: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly InvoiceItemRecord[];
}

export type CommandInvoker = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export class SQLiteInvoiceRepository implements InvoiceRepository {
  constructor(private readonly commandInvoker: CommandInvoker = invoke) {}

  // 1. Create new draft (automatically generate a next id)
  async createDraft(
    input: CreateDraftPersistenceInput,
  ): Promise<Result<Invoice, InvoicePersistenceFailure>> {
    try {
      const record = (await this.commandInvoker("create_invoice_draft", {
        input,
      })) as InvoiceRecord;
      return ok(rehydrateInvoice(record));
    } catch {
      return err(mapPersistenceFailure("create_draft"));
    }
  }

  // 2. Tìm hóa đơn theo ID
  async findById(invoiceId: string): Promise<Result<Invoice | null, InvoicePersistenceFailure>> {
    try {
      const record = (await this.commandInvoker("get_invoice", {
        invoiceId,
      })) as InvoiceRecord | null;
      return ok(record === null ? null : rehydrateInvoice(record));
    } catch {
      return err(mapPersistenceFailure("get"));
    }
  }

  // 2b. Liệt kê hóa đơn theo trạng thái
  async listInvoices(
    status?: InvoiceStatus,
  ): Promise<Result<readonly Invoice[], InvoicePersistenceFailure>> {
    try {
      const records = (await this.commandInvoker("list_invoices", {
        status: status ?? null,
      })) as InvoiceRecord[];
      const invoices: Invoice[] = [];
      for (const record of records) {
        try {
          invoices.push(rehydrateInvoice(record));
        } catch {
          // Skip corrupt records to preserve availability of other invoices
        }
      }
      return ok(invoices);
    } catch {
      return err(mapPersistenceFailure("list"));
    }
  }

  // 3. Lưu bản nháp
  async saveDraft(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    return this.write("save_invoice_draft", "save_draft", invoice);
  }

  // 4. Hoàn tất hóa đơn
  async complete(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    return this.write("complete_invoice", "complete", invoice);
  }

  // 5. Ghi đè hóa đơn đã chốt
  async overwriteCompleted(invoice: Invoice): Promise<Result<void, InvoicePersistenceFailure>> {
    return this.write("overwrite_completed_invoice", "overwrite_completed", invoice);
  }

  // 6. Xóa bản nháp
  async deleteDraft(invoiceId: string): Promise<Result<void, InvoicePersistenceFailure>> {
    try {
      await this.commandInvoker("delete_invoice_draft", { id: invoiceId });
      return ok(undefined);
    } catch {
      return err(mapPersistenceFailure("delete_draft"));
    }
  }

  private async write(
    command: "save_invoice_draft" | "complete_invoice" | "overwrite_completed_invoice",
    operation: "save_draft" | "complete" | "overwrite_completed",
    invoice: Invoice,
  ): Promise<Result<void, InvoicePersistenceFailure>> {
    try {
      await this.commandInvoker(command, { invoice: toRecord(invoice) });
      return ok(undefined);
    } catch {
      return err(mapPersistenceFailure(operation));
    }
  }
}

function toRecord(invoice: Invoice): InvoiceRecord {
  const state = invoice.toState();
  return {
    id: state.id,
    invoiceNumber: state.invoiceNumber,
    status: state.status,
    total: state.total,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
    items: state.items.map((item) => {
      const itemState = item.toState();
      return {
        id: itemState.id,
        invoiceId: itemState.invoiceId,
        productId: itemState.productId,
        unitId: itemState.unitId,
        productName: itemState.productName,
        productSku: itemState.productSku,
        productBrand: itemState.productBrand,
        unitName: itemState.unitName,
        unitPrice: itemState.unitPrice,
        quantity: itemState.quantity,
        subtotal: itemState.subtotal,
        discountBasisPoints: itemState.discountBasisPoints,
        note: itemState.note,
        createdAt: itemState.createdAt,
      };
    }),
  };
}

function rehydrateInvoice(record: InvoiceRecord): Invoice {
  return Invoice.rehydrate({
    ...record,
    items: record.items.map((item) =>
      InvoiceItem.rehydrate({
        id: item.id,
        invoiceId: item.invoiceId,
        productId: item.productId,
        unitId: item.unitId,
        productName: item.productName,
        productSku: item.productSku,
        productBrand: item.productBrand,
        unitName: item.unitName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        discountBasisPoints: item.discountBasisPoints,
        note: item.note ?? null,
        createdAt: item.createdAt,
      }),
    ),
  });
}

function mapPersistenceFailure(operation: InvoiceRepositoryOperation): InvoicePersistenceFailure {
  return {
    code: "persistence",
    operation,
    message: `Database ${operation} operation failed.`,
  };
}
