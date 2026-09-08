import type { ProductNotFound, ProductValidationFailure } from "../errors/ProductCatalogError";
import { ProductValidationError } from "../../domain/entities/Product";
import { UnitValidationError } from "../../domain/entities/Unit";

export function validationFailure(message: string): ProductValidationFailure {
  return { code: "validation", message };
}

export function mapDomainValidation(error: unknown): ProductValidationFailure {
  if (error instanceof ProductValidationError || error instanceof UnitValidationError) {
    return validationFailure(error.message);
  }

  throw error;
}

export function productNotFound(productId: string): ProductNotFound {
  return { code: "not_found", productId };
}
