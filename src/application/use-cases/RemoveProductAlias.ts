import type {
  ProductPersistenceFailure,
  ProductValidationFailure,
} from "../errors/ProductCatalogError";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type { ProductAliasRepository } from "../repositories/ProductAliasRepository";
import { err, ok, type Result } from "../shared/Result";
import { isUuidV4 } from "../shared/Uuid";
import { validationFailure } from "./ProductUseCaseSupport";

export interface RemoveProductAliasInput {
  readonly aliasId: string;
}

export class RemoveProductAlias {
  constructor(
    private readonly aliasRepository: ProductAliasRepository,
    private readonly searchIndex?: ProductSearchIndex,
  ) {}

  async execute(
    input: RemoveProductAliasInput,
  ): Promise<Result<void, ProductPersistenceFailure | ProductValidationFailure>> {
    if (!isUuidV4(input.aliasId)) {
      return err(validationFailure("aliasId must be a valid UUID v4."));
    }

    const removed = await this.aliasRepository.remove(input.aliasId);
    if (!removed.ok) return err(removed.error);

    this.searchIndex?.removeAlias(input.aliasId);
    return ok(undefined);
  }
}
