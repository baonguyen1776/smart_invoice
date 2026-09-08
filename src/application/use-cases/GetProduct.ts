import type { Product } from "../../domain/entities/Product";
import type { ProductCatalogError } from "../errors/ProductCatalogError";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { isUuidV4 } from "../shared/Uuid";
import { productNotFound, validationFailure } from "./ProductUseCaseSupport";

export interface GetProductInput {
  readonly productId: string;
}

export class GetProduct {
  constructor(private readonly repository: ProductRepository) {}

  async execute(input: GetProductInput): Promise<Result<Product, ProductCatalogError>> {
    if (!isUuidV4(input.productId)) {
      return err(validationFailure("productId must be a valid UUID v4."));
    }

    const result = await this.repository.findById(input.productId);

    if (!result.ok) {
      return err(result.error);
    }

    return result.value === null ? err(productNotFound(input.productId)) : ok(result.value);
  }
}
