import type { ProductSearchError } from "../errors/ProductCatalogError";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type { ProductAliasRepository } from "../repositories/ProductAliasRepository";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";

export class LoadProductSearchIndex {
  private pending: Promise<Result<void, ProductSearchError>> | null = null;
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly aliasRepository: ProductAliasRepository,
    private readonly searchIndex: ProductSearchIndex,
  ) {}

  execute(): Promise<Result<void, ProductSearchError>> {
    if (this.pending) return this.pending;
    this.pending = this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<Result<void, ProductSearchError>> {
    const products = await this.productRepository.list("active");
    if (!products.ok) return err(products.error);

    const aliases = await this.aliasRepository.listForActiveProducts();
    if (!aliases.ok) return err(aliases.error);

    this.searchIndex.replace(products.value, aliases.value);
    return ok(undefined);
  }
}
