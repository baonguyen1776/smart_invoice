import { sumInvoiceAmounts } from "../rules/CalculateInvoiceAmounts";
import { InvoiceItem } from "./InvoiceItem";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvoiceStatus = "draft" | "completed";

export interface InvoiceState {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly status: InvoiceStatus;
  readonly total: number;
  readonly oldDebt?: number;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly customerAddress?: string | null;
  readonly customerNote?: string | null;
  readonly isPrinted?: boolean;
  readonly printedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly InvoiceItem[];
}

export interface CreateInvoiceDraftInput {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly createdAt: string;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly customerAddress?: string | null;
  readonly customerNote?: string | null;
}

export class InvoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceValidationError";
  }
}

export class Invoice {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly status: InvoiceStatus;
  readonly total: number;
  readonly oldDebt: number;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly customerAddress: string | null;
  readonly customerNote: string | null;
  readonly isPrinted: boolean;
  readonly printedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly InvoiceItem[];

  private constructor(state: InvoiceState) {
    this.id = state.id;
    this.invoiceNumber = state.invoiceNumber;
    this.status = state.status;
    this.total = state.total;
    this.oldDebt = state.oldDebt ?? 0;
    this.customerName = state.customerName ?? null;
    this.customerPhone = state.customerPhone ?? null;
    this.customerAddress = state.customerAddress ?? null;
    this.customerNote = state.customerNote ?? null;
    this.isPrinted = Boolean(state.isPrinted);
    this.printedAt = state.printedAt ?? null;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.completedAt = state.completedAt;
    this.items = Object.freeze([...state.items]);
  }

  static createDraft(input: CreateInvoiceDraftInput): Invoice {
    return Invoice.fromState({
      ...input,
      status: "draft",
      total: 0,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      customerAddress: input.customerAddress ?? null,
      customerNote: input.customerNote ?? null,
      isPrinted: false,
      printedAt: null,
      updatedAt: input.createdAt,
      completedAt: null,
      items: [],
    });
  }

  static rehydrate(state: InvoiceState): Invoice {
    return Invoice.fromState(state);
  }

  replaceDraftItems(items: readonly InvoiceItem[], updatedAt: string): Invoice {
    if (this.status !== "draft") {
      throw new InvoiceValidationError("A completed Invoice cannot be edited as a draft.");
    }

    return Invoice.fromState({ ...this.toState(), items, updatedAt, total: calculateTotal(items) });
  }

  withCustomer(
    customer: {
      name?: string | null;
      phone?: string | null;
      address?: string | null;
      note?: string | null;
    },
    updatedAt: string = new Date().toISOString(),
  ): Invoice {
    return Invoice.fromState({
      ...this.toState(),
      customerName: customer.name ?? null,
      customerPhone: customer.phone ?? null,
      customerAddress: customer.address ?? null,
      customerNote: customer.note ?? null,
      updatedAt,
    });
  }

  withOldDebt(oldDebt: number, updatedAt: string): Invoice {
    return Invoice.fromState({ ...this.toState(), oldDebt, updatedAt });
  }

  get finalTotal(): number {
    return this.total + this.oldDebt;
  }

  markPrinted(printedAt: string = new Date().toISOString()): Invoice {
    validateTimestamp(printedAt, "printedAt");
    return Invoice.fromState({
      ...this.toState(),
      isPrinted: true,
      printedAt,
      updatedAt: printedAt,
    });
  }

  complete(completedAt: string): Invoice {
    if (this.status !== "draft") {
      throw new InvoiceValidationError("A completed Invoice cannot return to draft.");
    }

    if (this.items.length === 0) {
      throw new InvoiceValidationError("Completing an Invoice requires at least one item.");
    }

    return Invoice.fromState({
      ...this.toState(),
      status: "completed",
      updatedAt: completedAt,
      completedAt,
    });
  }

  overwriteCompleted(
    items: readonly InvoiceItem[],
    updatedAt: string,
    oldDebt = this.oldDebt,
  ): Invoice {
    if (this.status !== "completed") {
      throw new InvoiceValidationError("Only a completed Invoice can be overwritten.");
    }

    if (items.length === 0) {
      throw new InvoiceValidationError("A completed Invoice requires at least one item.");
    }

    return Invoice.fromState({
      ...this.toState(),
      items,
      total: calculateTotal(items),
      oldDebt,
      updatedAt,
    });
  }

  toState(): InvoiceState {
    return {
      id: this.id,
      invoiceNumber: this.invoiceNumber,
      status: this.status,
      total: this.total,
      oldDebt: this.oldDebt,
      customerName: this.customerName,
      customerPhone: this.customerPhone,
      customerAddress: this.customerAddress,
      customerNote: this.customerNote,
      isPrinted: this.isPrinted,
      printedAt: this.printedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      items: this.items,
    };
  }

  private static fromState(state: InvoiceState): Invoice {
    validateUuid(state.id);
    validatePositiveSafeInteger(state.invoiceNumber, "invoiceNumber");
    validateTimestamp(state.createdAt, "createdAt");
    validateTimestamp(state.updatedAt, "updatedAt");

    if (state.status !== "draft" && state.status !== "completed") {
      throw new InvoiceValidationError("status must be draft or completed.");
    }

    if ((state.status === "draft") !== (state.completedAt === null)) {
      throw new InvoiceValidationError("status and completedAt must be consistent.");
    }

    if (state.completedAt !== null) validateTimestamp(state.completedAt, "completedAt");
    validateItems(state.id, state.items);

    const total = calculateTotal(state.items);
    const oldDebt = state.oldDebt ?? 0;
    if (!Number.isSafeInteger(oldDebt) || oldDebt < 0) {
      throw new InvoiceValidationError("Old debt must be a non-negative safe integer in VND.");
    }
    if (BigInt(total) + BigInt(oldDebt) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new InvoiceValidationError("Final total exceeds the safe integer range.");
    }
    if (state.status === "completed" && state.total !== total) {
      throw new InvoiceValidationError("total must equal the sum of item payments.");
    }

    if (state.status === "completed" && state.items.length === 0) {
      throw new InvoiceValidationError("A completed Invoice requires at least one item.");
    }

    const customerName = sanitizeNullableText(state.customerName);
    const customerPhone = sanitizeNullableText(state.customerPhone);
    const customerAddress = sanitizeNullableText(state.customerAddress);
    const customerNote = sanitizeNullableText(state.customerNote);
    const isPrinted = Boolean(state.isPrinted);
    const printedAt = state.printedAt ? sanitizeNullableText(state.printedAt) : null;
    if (printedAt !== null) validateTimestamp(printedAt, "printedAt");

    return new Invoice({
      ...state,
      total,
      customerName,
      customerPhone,
      customerAddress,
      customerNote,
      isPrinted,
      printedAt,
    });
  }
}

function sanitizeNullableText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateItems(invoiceId: string, items: readonly InvoiceItem[]): void {
  if (!Array.isArray(items)) throw new InvoiceValidationError("items must be an array.");

  const ids = new Set<string>();
  for (const item of items) {
    if (!(item instanceof InvoiceItem)) {
      throw new InvoiceValidationError("Invoice items must be valid InvoiceItems.");
    }
    if (item.invoiceId !== invoiceId) {
      throw new InvoiceValidationError("Every InvoiceItem must belong to its Invoice.");
    }
    if (ids.has(item.id)) {
      throw new InvoiceValidationError("InvoiceItem identities must be unique within an Invoice.");
    }
    ids.add(item.id);
  }
}

function calculateTotal(items: readonly InvoiceItem[]): number {
  try {
    return sumInvoiceAmounts(items).payment;
  } catch {
    throw new InvoiceValidationError("Invoice total exceeds the safe integer range.");
  }
}

function validateUuid(value: string): void {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new InvoiceValidationError("id must be a valid UUID v4.");
  }
}

function validatePositiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvoiceValidationError(`${field} must be a positive safe integer.`);
  }
}

function validateTimestamp(value: string, field: string): void {
  try {
    if (new Date(value).toISOString() !== value) throw new Error();
  } catch {
    throw new InvoiceValidationError(`${field} must be a canonical ISO-8601 UTC timestamp.`);
  }
}
