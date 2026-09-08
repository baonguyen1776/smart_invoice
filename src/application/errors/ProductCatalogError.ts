export type ProductRepositoryOperation = "create" | "get" | "update" | "deactivate" | "list";

export interface ProductValidationFailure {
  readonly code: "validation";
  readonly message: string;
}

export interface ProductNotFound {
  readonly code: "not_found";
  readonly productId: string;
}

export interface SkuConflict {
  readonly code: "sku_conflict";
  readonly sku: string;
}

export interface ProductPersistenceFailure {
  readonly code: "persistence";
  readonly operation: ProductRepositoryOperation;
  readonly message: string;
}

export type ProductRepositoryWriteError = SkuConflict | ProductPersistenceFailure;

export type ProductCatalogError =
  ProductValidationFailure | ProductNotFound | ProductRepositoryWriteError;
