import type { ProductAlias } from "../../domain/entities/ProductAlias";
import type { Product } from "../../domain/entities/Product";

export type ProductSearchMatch = "id" | "sku" | "fuzzy";

export interface ProductSearchCandidate {
  readonly product: Product;
  readonly activeUnitNames: readonly string[];
  readonly matchedBy: ProductSearchMatch;
  readonly score: number;
}

export interface ProductSearchIndex {
  readonly isReady: boolean;
  replace(products: readonly Product[], aliases: readonly ProductAlias[]): void;
  upsertProduct(product: Product): void;
  removeProduct(productId: string): void;
  upsertAlias(alias: ProductAlias): void;
  removeAlias(aliasId: string): void;
  search(query: string, limit: number): readonly ProductSearchCandidate[];
}
