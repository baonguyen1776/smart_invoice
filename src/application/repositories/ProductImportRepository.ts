import type { Product } from "../../domain/entities/Product";
import type { ProductAlias } from "../../domain/entities/ProductAlias";
import type {
  ProductAliasConflict,
  ProductPersistenceFailure,
  SkuConflict,
} from "../errors/ProductCatalogError";
import type { Result } from "../shared/Result";

export interface ProductImportWrite {
  readonly kind: "create" | "update";
  readonly product: Product;
  readonly aliases: readonly ProductAlias[];
}

export type ProductImportWriteError =
  SkuConflict | ProductAliasConflict | ProductPersistenceFailure;

export interface ProductImportRepository {
  apply(writes: readonly ProductImportWrite[]): Promise<Result<void, ProductImportWriteError>>;
}
