export type ProductRepositoryOperation =
  | "create"
  | "get"
  | "update"
  | "deactivate"
  | "reactivate"
  | "list"
  | "create_alias"
  | "remove_alias"
  | "list_aliases"
  | "import";

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

export interface ProductAliasConflict {
  readonly code: "alias_conflict";
  readonly alias: string;
}

export interface ProductSearchNotReady {
  readonly code: "search_not_ready";
  readonly message: string;
}

export interface ProductPersistenceFailure {
  readonly code: "persistence";
  readonly operation: ProductRepositoryOperation;
  readonly message: string;
}

export type ProductRepositoryWriteError = SkuConflict | ProductPersistenceFailure;

export type ProductAliasRepositoryWriteError = ProductAliasConflict | ProductPersistenceFailure;

export type ProductCatalogError =
  ProductValidationFailure | ProductNotFound | ProductRepositoryWriteError;

export type ProductAliasCatalogError =
  ProductValidationFailure | ProductNotFound | ProductAliasRepositoryWriteError;

export type ProductSearchError =
  ProductValidationFailure | ProductPersistenceFailure | ProductSearchNotReady;
