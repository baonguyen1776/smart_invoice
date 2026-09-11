import type { Product } from "../../domain/entities/Product";
import type {
  ProductPersistenceFailure,
  ProductRepositoryOperation,
  ProductRepositoryWriteError,
} from "../../application/errors/ProductCatalogError";
import type {
  ProductActivityFilter,
  ProductRepository,
} from "../../application/repositories/ProductRepository";
import { err, ok, type Result } from "../../application/shared/Result";

export class InMemoryProductRepository implements ProductRepository {
  readonly createCalls: Product[] = [];
  readonly updateCalls: Product[] = [];
  readonly deactivateCalls: Product[] = [];
  readonly reactivateCalls: Product[] = [];

  private readonly products = new Map<string, Product>();
  private readonly failures = new Map<ProductRepositoryOperation, ProductPersistenceFailure>();

  constructor(initialProducts: readonly Product[] = []) {
    for (const product of initialProducts) {
      this.products.set(product.id, product);
    }
  }

  failNext(operation: ProductRepositoryOperation, message: string): void {
    this.failures.set(operation, {
      code: "persistence",
      operation,
      message,
    });
  }

  async create(product: Product): Promise<Result<void, ProductRepositoryWriteError>> {
    this.createCalls.push(product);
    const failure = this.takeFailure("create");

    if (failure !== null) return err(failure);

    if (this.hasSkuConflict(product)) {
      return err({ code: "sku_conflict", sku: product.sku! });
    }

    this.products.set(product.id, product);
    return ok(undefined);
  }

  async findById(productId: string): Promise<Result<Product | null, ProductPersistenceFailure>> {
    const failure = this.takeFailure("get");

    return failure === null ? ok(this.products.get(productId) ?? null) : err(failure);
  }

  async update(product: Product): Promise<Result<void, ProductRepositoryWriteError>> {
    this.updateCalls.push(product);
    const failure = this.takeFailure("update");

    if (failure !== null) return err(failure);

    if (this.hasSkuConflict(product)) {
      return err({ code: "sku_conflict", sku: product.sku! });
    }

    this.products.set(product.id, product);
    return ok(undefined);
  }

  async deactivate(product: Product): Promise<Result<void, ProductPersistenceFailure>> {
    this.deactivateCalls.push(product);
    const failure = this.takeFailure("deactivate");

    if (failure !== null) return err(failure);

    this.products.set(product.id, product);
    return ok(undefined);
  }

  async reactivate(product: Product): Promise<Result<void, ProductPersistenceFailure>> {
    this.reactivateCalls.push(product);
    const failure = this.takeFailure("reactivate");

    if (failure !== null) return err(failure);

    this.products.set(product.id, product);
    return ok(undefined);
  }

  async list(
    filter: ProductActivityFilter,
  ): Promise<Result<readonly Product[], ProductPersistenceFailure>> {
    const failure = this.takeFailure("list");

    if (failure !== null) return err(failure);

    const products = [...this.products.values()].filter((product) => {
      if (filter === "all") return true;
      return filter === "active" ? product.isActive : !product.isActive;
    });

    return ok(products);
  }

  private hasSkuConflict(product: Product): boolean {
    if (product.sku === null) return false;

    const normalizedSku = product.sku.toLowerCase();

    return [...this.products.values()].some(
      (candidate) => candidate.id !== product.id && candidate.sku?.toLowerCase() === normalizedSku,
    );
  }

  private takeFailure(operation: ProductRepositoryOperation): ProductPersistenceFailure | null {
    const failure = this.failures.get(operation) ?? null;
    this.failures.delete(operation);
    return failure;
  }
}
