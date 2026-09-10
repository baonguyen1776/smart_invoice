import { ProductAlias } from "../../domain/entities/ProductAlias";
import type { ProductAliasCatalogError } from "../errors/ProductCatalogError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type { ProductAliasRepository } from "../repositories/ProductAliasRepository";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { isUuidV4 } from "../shared/Uuid";
import { mapDomainValidation, productNotFound, validationFailure } from "./ProductUseCaseSupport";

export interface CreateProductAliasInput {
  readonly productId: string;
  readonly alias: string;
  readonly sourceKey?: string | null;
  readonly sourceNameRaw?: string | null;
  readonly unitName?: string | null;
}

export class CreateProductAlias {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly aliasRepository: ProductAliasRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly searchIndex?: ProductSearchIndex,
  ) {}

  async execute(
    input: CreateProductAliasInput,
  ): Promise<Result<ProductAlias, ProductAliasCatalogError>> {
    if (!isUuidV4(input.productId)) {
      return err(validationFailure("productId must be a valid UUID v4."));
    }

    const product = await this.productRepository.findById(input.productId);
    if (!product.ok) return err(product.error);
    if (product.value === null) return err(productNotFound(input.productId));
    if (!product.value.isActive) {
      return err(validationFailure("Aliases can only be added to active Products."));
    }

    let alias: ProductAlias;
    try {
      alias = ProductAlias.create({
        id: this.idGenerator.generate(),
        productId: input.productId,
        alias: input.alias,
        sourceKey: input.sourceKey,
        sourceNameRaw: input.sourceNameRaw,
        unitName: input.unitName,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      return err(mapDomainValidation(error));
    }

    const persisted = await this.aliasRepository.create(alias);
    if (!persisted.ok) return err(persisted.error);

    this.searchIndex?.upsertAlias(alias);
    return ok(alias);
  }
}
