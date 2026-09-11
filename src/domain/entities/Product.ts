import { Unit } from "./Unit";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProductState {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  units: readonly Unit[];
}

export interface CreateProductInput {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  createdAt: string;
  units: readonly Unit[];
}

export interface UpdateProductInput {
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  updatedAt: string;
  units: readonly Unit[];
}

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductValidationError";
  }
}

export class Product {
  readonly id: string;
  readonly sku: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly units: readonly Unit[];

  private constructor(state: ProductState) {
    this.id = state.id;
    this.sku = state.sku;
    this.name = state.name;
    this.brand = state.brand;
    this.category = state.category;
    this.isActive = state.isActive;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.units = Object.freeze([...state.units]);
  }

  static create(input: CreateProductInput): Product {
    return Product.fromState({
      ...input,
      isActive: true,
      updatedAt: input.createdAt,
    });
  }

  static rehydrate(state: ProductState): Product {
    return Product.fromState(state);
  }

  update(input: UpdateProductInput): Product {
    return Product.fromState({
      ...this.toState(),
      ...input,
    });
  }

  deactivate(updatedAt: string): Product {
    if (!this.isActive) {
      return this;
    }

    return Product.fromState({
      ...this.toState(),
      isActive: false,
      updatedAt,
    });
  }

  reactivate(updatedAt: string): Product {
    if (this.isActive) {
      return this;
    }

    return Product.fromState({
      ...this.toState(),
      isActive: true,
      updatedAt,
    });
  }

  private static fromState(state: ProductState): Product {
    validateUuid(state.id, "id");
    validateTimestamp(state.createdAt, "createdAt");
    validateTimestamp(state.updatedAt, "updatedAt");

    if (typeof state.isActive !== "boolean") {
      throw new ProductValidationError("isActive must be a boolean.");
    }

    const name = normalizeRequiredText(state.name, "name");
    const sku = normalizeOptionalText(state.sku, "sku");
    const brand = normalizeOptionalText(state.brand, "brand");
    const category = normalizeOptionalText(state.category, "category");

    validateUnits(state.id, state.units);

    return new Product({
      ...state,
      name,
      sku,
      brand,
      category,
    });
  }

  private toState(): ProductState {
    return {
      id: this.id,
      sku: this.sku,
      name: this.name,
      brand: this.brand,
      category: this.category,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      units: this.units,
    };
  }
}

function normalizeRequiredText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductValidationError(`${field} must not be empty.`);
  }

  return value.trim();
}

function normalizeOptionalText(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductValidationError(`${field} must not be empty when provided.`);
  }

  return value.trim();
}

function validateUnits(productId: string, units: readonly Unit[]): void {
  if (!Array.isArray(units) || units.length === 0) {
    throw new ProductValidationError("Product must own at least one Unit.");
  }

  const unitNames = new Set<string>();
  const unitIds = new Set<string>();
  let hasActiveUnit = false;

  for (const unit of units) {
    if (!(unit instanceof Unit)) {
      throw new ProductValidationError("Product units must be valid Units.");
    }

    if (unit.productId !== productId) {
      throw new ProductValidationError("Every Unit must belong to its Product.");
    }

    if (unitIds.has(unit.id)) {
      throw new ProductValidationError("Unit identities must be unique within a Product.");
    }

    unitIds.add(unit.id);

    const normalizedUnitName = unit.name.toLowerCase();

    if (unitNames.has(normalizedUnitName)) {
      throw new ProductValidationError("Unit names must be unique within a Product.");
    }

    unitNames.add(normalizedUnitName);
    hasActiveUnit ||= unit.isActive;
  }

  if (!hasActiveUnit) {
    throw new ProductValidationError("Product must have at least one active Unit.");
  }
}

function validateUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new ProductValidationError(`${field} must be a valid UUID v4.`);
  }
}

function validateTimestamp(value: string, field: string): void {
  try {
    if (new Date(value).toISOString() !== value) {
      throw new Error();
    }
  } catch {
    throw new ProductValidationError(`${field} must be a canonical ISO-8601 UTC timestamp.`);
  }
}
