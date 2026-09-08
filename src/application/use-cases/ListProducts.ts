import type { Product } from "../../domain/entities/Product";
import type { ProductCatalogError } from "../errors/ProductCatalogError";
import type { ProductActivityFilter, ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { validationFailure } from "./ProductUseCaseSupport";

export interface ListProductsInput {
  readonly activity?: ProductActivityFilter;
}

const ACTIVITY_FILTERS: readonly ProductActivityFilter[] = ["active", "inactive", "all"];

export class ListProducts {
  constructor(private readonly repository: ProductRepository) {}

  async execute(
    input: ListProductsInput = {},
  ): Promise<Result<readonly Product[], ProductCatalogError>> {
    const activity = input.activity ?? "active";

    if (!ACTIVITY_FILTERS.includes(activity)) {
      return err(validationFailure("activity must be active, inactive, or all."));
    }

    const result = await this.repository.list(activity);

    return result.ok ? ok(result.value) : err(result.error);
  }
}
