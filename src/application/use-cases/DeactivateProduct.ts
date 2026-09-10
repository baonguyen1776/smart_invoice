import type { Product } from "../../domain/entities/Product";
import type { ProductCatalogError } from "../errors/ProductCatalogError";
import type { Clock } from "../ports/Clock";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { isUuidV4 } from "../shared/Uuid";
import { mapDomainValidation, productNotFound, validationFailure } from "./ProductUseCaseSupport";

export interface DeactivateProductInput {
  readonly productId: string;
}

export class DeactivateProduct {
  constructor(
    private readonly repository: ProductRepository,
    private readonly clock: Clock,
    private readonly searchIndex?: ProductSearchIndex,
  ) {}

  async execute(input: DeactivateProductInput): Promise<Result<Product, ProductCatalogError>> {
    if (!isUuidV4(input.productId)) {
      return err(validationFailure("productId must be a valid UUID v4."));
    }

    const found = await this.repository.findById(input.productId);

    if (!found.ok) {
      return err(found.error);
    }

    if (found.value === null) {
      return err(productNotFound(input.productId));
    }

    if (!found.value.isActive) {
      return ok(found.value);
    }

    let product: Product;

    try {
      product = found.value.deactivate(this.clock.now());
    } catch (error) {
      return err(mapDomainValidation(error));
    }

    const persisted = await this.repository.deactivate(product);

    if (!persisted.ok) return err(persisted.error);

    this.searchIndex?.removeProduct(product.id);
    return ok(product);
  }
}
