import type { Product } from "../../domain/entities/Product";
import type {
  ProductPersistenceFailure,
  ProductRepositoryWriteError,
} from "../errors/ProductCatalogError";
import type { Result } from "../shared/Result";

export type ProductActivityFilter = "active" | "inactive" | "all";

/**
 * Implementations map expected persistence/constraint failures into Result.
 * Raw database errors must not escape by rejecting these operations.
 */
export interface ProductRepository {
  create(product: Product): Promise<Result<void, ProductRepositoryWriteError>>;
  findById(productId: string): Promise<Result<Product | null, ProductPersistenceFailure>>;
  update(product: Product): Promise<Result<void, ProductRepositoryWriteError>>;
  deactivate(product: Product): Promise<Result<void, ProductPersistenceFailure>>;
  reactivate(product: Product): Promise<Result<void, ProductPersistenceFailure>>;
  list(
    filter: ProductActivityFilter,
  ): Promise<Result<readonly Product[], ProductPersistenceFailure>>;
}
