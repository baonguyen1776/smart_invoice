import type { ProductSearchError } from "../errors/ProductCatalogError";
import type { ProductSearchCandidate, ProductSearchIndex } from "../ports/ProductSearchIndex";
import { err, ok, type Result } from "../shared/Result";
import { validationFailure } from "./ProductUseCaseSupport";

export interface SearchProductsInput {
  readonly query: string;
  readonly limit?: number;
  readonly exactIdOnly?: boolean;
}

export class SearchProducts {
  constructor(private readonly searchIndex: ProductSearchIndex) {}

  execute(
    input: SearchProductsInput,
  ): Result<readonly ProductSearchCandidate[], ProductSearchError> {
    if (!this.searchIndex.isReady) {
      return err({
        code: "search_not_ready",
        message: "Product search is still loading.",
      });
    }

    if (typeof input.query !== "string") {
      return err(validationFailure("query must be a string."));
    }

    const limit = input.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return err(validationFailure("limit must be an integer between 1 and 50."));
    }

    return ok(this.searchIndex.search(input.query, limit, input.exactIdOnly));
  }
}
