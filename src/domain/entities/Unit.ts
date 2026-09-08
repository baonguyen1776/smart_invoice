const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UnitState {
  id: string;
  productId: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitInput {
  id: string;
  productId: string;
  name: string;
  price: number;
  createdAt: string;
}

export interface UpdateUnitInput {
  name?: string;
  price?: number;
  updatedAt: string;
}

export class UnitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitValidationError";
  }
}

export class Unit {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(state: UnitState) {
    this.id = state.id;
    this.productId = state.productId;
    this.name = state.name;
    this.price = state.price;
    this.isActive = state.isActive;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  private static fromState(state: UnitState): Unit {
    validateUuid(state.id, "id");
    validateUuid(state.productId, "productId");
    validateTimestamp(state.createdAt, "createdAt");
    validateTimestamp(state.updatedAt, "updatedAt");

    if (typeof state.isActive !== "boolean") {
      throw new UnitValidationError("isActive must be a boolean.");
    }

    if (typeof state.name !== "string") {
      throw new UnitValidationError("Unit name must be a string.");
    }

    const normalizedName = state.name.trim();

    if (normalizedName.length === 0) {
      throw new UnitValidationError("Unit name must not be empty.");
    }

    if (!Number.isSafeInteger(state.price) || state.price < 0) {
      throw new UnitValidationError("Unit price must be a non-negative safe integer.");
    }

    return new Unit({
      ...state,
      name: normalizedName,
    });
  }

  static create(input: CreateUnitInput): Unit {
    return Unit.fromState({
      ...input,
      isActive: true,
      updatedAt: input.createdAt,
    });
  }

  private toState(): UnitState {
    return {
      id: this.id,
      productId: this.productId,
      name: this.name,
      price: this.price,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  update(input: UpdateUnitInput): Unit {
    return Unit.fromState({
      ...this.toState(),
      name: input.name === undefined ? this.name : input.name,
      price: input.price === undefined ? this.price : input.price,
      updatedAt: input.updatedAt,
    });
  }

  deactivate(updatedAt: string): Unit {
    return Unit.fromState({
      ...this.toState(),
      isActive: false,
      updatedAt,
    });
  }

  static rehydrate(state: UnitState): Unit {
    return Unit.fromState(state);
  }
}

function validateUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new UnitValidationError(`${field} must be a valid UUID v4.`);
  }
}

function validateTimestamp(value: string, field: string): void {
  try {
    if (new Date(value).toISOString() !== value) {
      throw new Error();
    }
  } catch {
    throw new UnitValidationError(`${field} must be a canonical ISO-8601 UTC timestamp.`);
  }
}
