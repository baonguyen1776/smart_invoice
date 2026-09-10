import { normalizeCatalogSearchText } from "../rules/NormalizeCatalogSearchText";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProductAliasState {
  readonly id: string;
  readonly productId: string;
  readonly alias: string;
  readonly normalizedAlias: string;
  readonly sourceKey: string | null;
  readonly sourceNameRaw: string | null;
  readonly unitName: string | null;
  readonly createdAt: string;
}

export interface CreateProductAliasInput {
  readonly id: string;
  readonly productId: string;
  readonly alias: string;
  readonly sourceKey?: string | null;
  readonly sourceNameRaw?: string | null;
  readonly unitName?: string | null;
  readonly createdAt: string;
}

export class ProductAliasValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductAliasValidationError";
  }
}

export class ProductAlias {
  readonly id: string;
  readonly productId: string;
  readonly alias: string;
  readonly normalizedAlias: string;
  readonly sourceKey: string | null;
  readonly sourceNameRaw: string | null;
  readonly unitName: string | null;
  readonly createdAt: string;

  private constructor(state: ProductAliasState) {
    this.id = state.id;
    this.productId = state.productId;
    this.alias = state.alias;
    this.normalizedAlias = state.normalizedAlias;
    this.sourceKey = state.sourceKey;
    this.sourceNameRaw = state.sourceNameRaw;
    this.unitName = state.unitName;
    this.createdAt = state.createdAt;
  }

  static create(input: CreateProductAliasInput): ProductAlias {
    const alias = normalizeRequiredText(input.alias, "alias");

    return ProductAlias.fromState({
      ...input,
      alias,
      normalizedAlias: normalizeCatalogSearchText(alias),
      sourceKey: input.sourceKey ?? null,
      sourceNameRaw: input.sourceNameRaw ?? null,
      unitName: input.unitName ?? null,
    });
  }

  static rehydrate(state: ProductAliasState): ProductAlias {
    return ProductAlias.fromState(state);
  }

  private static fromState(state: ProductAliasState): ProductAlias {
    validateUuid(state.id, "id");
    validateUuid(state.productId, "productId");
    validateTimestamp(state.createdAt);

    const alias = normalizeRequiredText(state.alias, "alias");
    const normalizedAlias = normalizeRequiredText(state.normalizedAlias, "normalizedAlias");
    const expectedNormalizedAlias = normalizeCatalogSearchText(alias);

    if (normalizedAlias !== expectedNormalizedAlias) {
      throw new ProductAliasValidationError(
        "normalizedAlias must match the canonical alias normalization.",
      );
    }

    if (state.sourceKey === null && state.sourceNameRaw !== null) {
      throw new ProductAliasValidationError("sourceNameRaw requires sourceKey.");
    }

    return new ProductAlias({
      ...state,
      alias,
      normalizedAlias,
      sourceKey: normalizeOptionalText(state.sourceKey, "sourceKey"),
      sourceNameRaw: normalizeOptionalText(state.sourceNameRaw, "sourceNameRaw"),
      unitName: normalizeOptionalText(state.unitName, "unitName"),
    });
  }
}

function normalizeRequiredText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductAliasValidationError(`${field} must not be empty.`);
  }

  return value.trim();
}

function normalizeOptionalText(value: string | null, field: string): string | null {
  if (value === null) return null;

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductAliasValidationError(`${field} must not be empty when provided.`);
  }

  return value.trim();
}

function validateUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new ProductAliasValidationError(`${field} must be a valid UUID v4.`);
  }
}

function validateTimestamp(value: string): void {
  try {
    if (new Date(value).toISOString() !== value) throw new Error();
  } catch {
    throw new ProductAliasValidationError("createdAt must be a canonical ISO-8601 UTC timestamp.");
  }
}
