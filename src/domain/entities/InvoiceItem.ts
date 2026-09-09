const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InvoiceItemState {
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
  readonly createdAt: string;
}

export type CreateInvoiceItemInput = Omit<InvoiceItemState, "subtotal">;

export interface UpdateInvoiceItemInput {
  readonly quantity?: number;
  readonly unitPrice?: number;
}

export class InvoiceItemValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceItemValidationError";
  }
}

export class InvoiceItem {
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
  readonly createdAt: string;

  private constructor(state: InvoiceItemState) {
    this.id = state.id;
    this.invoiceId = state.invoiceId;
    this.productId = state.productId;
    this.unitId = state.unitId;
    this.productName = state.productName;
    this.productSku = state.productSku;
    this.productBrand = state.productBrand;
    this.unitName = state.unitName;
    this.unitPrice = state.unitPrice;
    this.quantity = state.quantity;
    this.subtotal = state.subtotal;
    this.createdAt = state.createdAt;
  }

  static create(input: CreateInvoiceItemInput): InvoiceItem {
    return InvoiceItem.fromValues(input);
  }

  static rehydrate(state: InvoiceItemState): InvoiceItem {
    const item = InvoiceItem.fromValues(state);

    if (state.subtotal !== item.subtotal) {
      throw new InvoiceItemValidationError("subtotal must equal unitPrice multiplied by quantity.");
    }

    return item;
  }

  update(input: UpdateInvoiceItemInput): InvoiceItem {
    return InvoiceItem.fromValues({
      ...this.toState(),
      quantity: input.quantity ?? this.quantity,
      unitPrice: input.unitPrice ?? this.unitPrice,
    });
  }

  toState(): InvoiceItemState {
    return {
      id: this.id,
      invoiceId: this.invoiceId,
      productId: this.productId,
      unitId: this.unitId,
      productName: this.productName,
      productSku: this.productSku,
      productBrand: this.productBrand,
      unitName: this.unitName,
      unitPrice: this.unitPrice,
      quantity: this.quantity,
      subtotal: this.subtotal,
      createdAt: this.createdAt,
    };
  }

  private static fromValues(input: CreateInvoiceItemInput | InvoiceItemState): InvoiceItem {
    validateUuid(input.id, "id");
    validateUuid(input.invoiceId, "invoiceId");
    validateUuid(input.productId, "productId");
    validateUuid(input.unitId, "unitId");
    validateTimestamp(input.createdAt, "createdAt");
    validateMoney(input.unitPrice, "unitPrice");

    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
      throw new InvoiceItemValidationError("quantity must be a positive safe integer.");
    }

    const subtotal = input.unitPrice * input.quantity;
    validateMoney(subtotal, "subtotal");

    return new InvoiceItem({
      ...input,
      productName: normalizeRequiredText(input.productName, "productName"),
      productSku: normalizeOptionalText(input.productSku, "productSku"),
      productBrand: normalizeOptionalText(input.productBrand, "productBrand"),
      unitName: normalizeRequiredText(input.unitName, "unitName"),
      subtotal,
    });
  }
}

function validateUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new InvoiceItemValidationError(`${field} must be a valid UUID v4.`);
  }
}

function validateMoney(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvoiceItemValidationError(`${field} must be a non-negative safe integer.`);
  }
}

function normalizeRequiredText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvoiceItemValidationError(`${field} must not be empty.`);
  }

  return value.trim();
}

function normalizeOptionalText(value: string | null, field: string): string | null {
  if (value === null) return null;

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvoiceItemValidationError(`${field} must not be empty when provided.`);
  }

  return value.trim();
}

function validateTimestamp(value: string, field: string): void {
  try {
    if (new Date(value).toISOString() !== value) throw new Error();
  } catch {
    throw new InvoiceItemValidationError(`${field} must be a canonical ISO-8601 UTC timestamp.`);
  }
}
