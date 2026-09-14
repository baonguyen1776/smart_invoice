import Fuse, { type IFuseOptions } from "fuse.js";
import type {
  ProductSearchCandidate,
  ProductSearchIndex,
} from "../../application/ports/ProductSearchIndex";
import type { ProductAlias } from "../../domain/entities/ProductAlias";
import type { Product } from "../../domain/entities/Product";
import { normalizeCatalogSearchText } from "../../domain/rules/NormalizeCatalogSearchText";

interface SearchDocument {
  readonly product: Product;
  readonly searchText: string;
}

const FUSE_OPTIONS: IFuseOptions<SearchDocument> = {
  includeScore: true,
  ignoreDiacritics: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: ["searchText"],
};

const MAX_RESULT_SCORE = 0.45;

export class FuseProductSearchIndex implements ProductSearchIndex {
  private readonly products = new Map<string, Product>();
  private readonly aliases = new Map<string, ProductAlias>();
  private readonly exactSku = new Map<string, Product>();
  private fuse: Fuse<SearchDocument> | null = null;

  get isReady(): boolean {
    return this.fuse !== null;
  }

  replace(products: readonly Product[], aliases: readonly ProductAlias[]): void {
    this.products.clear();
    this.aliases.clear();

    for (const product of products) {
      if (product.isActive) this.products.set(product.id.toLowerCase(), product);
    }
    for (const alias of aliases) {
      this.aliases.set(alias.id, alias);
    }

    this.rebuild();
  }

  upsertProduct(product: Product): void {
    const productId = product.id.toLowerCase();
    if (product.isActive) {
      this.products.set(productId, product);
    } else {
      this.products.delete(productId);
    }
    if (this.isReady) this.rebuild();
  }

  removeProduct(productId: string): void {
    this.products.delete(productId.toLowerCase());
    if (this.isReady) this.rebuild();
  }

  upsertAlias(alias: ProductAlias): void {
    this.aliases.set(alias.id, alias);
    if (this.isReady) this.rebuild();
  }

  removeAlias(aliasId: string): void {
    this.aliases.delete(aliasId);
    if (this.isReady) this.rebuild();
  }

  search(query: string, limit: number, exactIdOnly = false): readonly ProductSearchCandidate[] {
    if (this.fuse === null) return [];

    const normalizedQuery = normalizeCatalogSearchText(query);
    if (normalizedQuery.length === 0) return [];

    const exactId = this.products.get(query.trim().toLowerCase());
    if (exactId !== undefined) return [toCandidate(exactId, "id", 0)];
    if (exactIdOnly) return [];

    const exactSku = this.exactSku.get(normalizeExactKey(query));
    if (exactSku !== undefined) return [toCandidate(exactSku, "sku", 0)];

    return this.fuse
      .search(normalizedQuery, { limit })
      .filter(({ score }) => (score ?? 1) <= MAX_RESULT_SCORE)
      .map(({ item, score }) => toCandidate(item.product, "fuzzy", score ?? 1));
  }

  private rebuild(): void {
    this.exactSku.clear();
    const aliasesByProduct = new Map<string, string[]>();

    for (const alias of this.aliases.values()) {
      const productId = alias.productId.toLowerCase();
      if (!this.products.has(productId)) continue;
      const values = aliasesByProduct.get(productId) ?? [];
      values.push(alias.normalizedAlias);
      aliasesByProduct.set(productId, values);
    }

    const documents = [...this.products.values()].map((product): SearchDocument => {
      const normalizedSku = normalizeCatalogSearchText(product.sku ?? "");
      const exactSku = normalizeExactKey(product.sku ?? "");
      if (exactSku.length > 0) this.exactSku.set(exactSku, product);

      const searchText = [
        normalizeCatalogSearchText(product.name),
        normalizedSku,
        normalizeCatalogSearchText(product.brand ?? ""),
        normalizeCatalogSearchText(product.category ?? ""),
        ...product.units
          .filter((unit) => unit.isActive)
          .map((unit) => normalizeCatalogSearchText(unit.name)),
        ...(aliasesByProduct.get(product.id.toLowerCase()) ?? []),
      ]
        .filter((value) => value.length > 0)
        .join(" ");

      return {
        product,
        searchText,
      };
    });

    this.fuse = new Fuse(documents, FUSE_OPTIONS);
  }
}

function normalizeExactKey(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("vi");
}

function toCandidate(
  product: Product,
  matchedBy: ProductSearchCandidate["matchedBy"],
  score: number,
): ProductSearchCandidate {
  return {
    product,
    activeUnitNames: product.units.filter((unit) => unit.isActive).map((unit) => unit.name),
    matchedBy,
    score,
  };
}
