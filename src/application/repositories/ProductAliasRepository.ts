import type { ProductAlias } from "../../domain/entities/ProductAlias";
import type {
  ProductAliasRepositoryWriteError,
  ProductPersistenceFailure,
} from "../errors/ProductCatalogError";
import type { Result } from "../shared/Result";

export interface ProductAliasRepository {
  create(alias: ProductAlias): Promise<Result<void, ProductAliasRepositoryWriteError>>;
  remove(aliasId: string): Promise<Result<void, ProductPersistenceFailure>>;
  listForActiveProducts(): Promise<Result<readonly ProductAlias[], ProductPersistenceFailure>>;
}
