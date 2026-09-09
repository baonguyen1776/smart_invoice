import { InvoiceItem } from "./InvoiceItem";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvoiceStatus = "draft" | "completed";

export interface InvoiceState {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly status: InvoiceStatus;
  readonly total: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly InvoiceItem[];
}

export interface CreateInvoiceDraftInput {
  readonly id: string;
  readonly invoiceNumber: number;
  readonly createdAt: string;
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly InvoiceItem[];

  private constructor(state: InvoiceState) {
    this.id = state.id;
    this.invoiceNumber = state.invoiceNumber;
    this.status = state.status;
    this.total = state.total;
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

  overwriteCompleted(items: readonly InvoiceItem[], updatedAt: string): Invoice {
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
      updatedAt,
    });
  }

  toState(): InvoiceState {
    return {
      id: this.id,
      invoiceNumber: this.invoiceNumber,
      status: this.status,
      total: this.total,
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
    if (state.total !== total) {
      throw new InvoiceValidationError("total must equal the sum of item subtotals.");
    }

    if (state.status === "completed" && state.items.length === 0) {
      throw new InvoiceValidationError("A completed Invoice requires at least one item.");
    }

    return new Invoice({ ...state, total });
  }
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
  let total = 0;
  for (const item of items) {
    total += item.subtotal;
    if (!Number.isSafeInteger(total)) {
      throw new InvoiceValidationError("Invoice total must be a non-negative safe integer.");
    }
  }
  return total;
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
