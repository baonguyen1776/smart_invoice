import type {
  ProductAliasRepositoryWriteError,
  ProductPersistenceFailure,
  ProductRepositoryOperation,
} from "../../application/errors/ProductCatalogError";
import type { ProductAliasRepository } from "../../application/repositories/ProductAliasRepository";
import { err, ok, type Result } from "../../application/shared/Result";
import type { ProductAlias } from "../../domain/entities/ProductAlias";

export class InMemoryProductAliasRepository implements ProductAliasRepository {
  readonly createCalls: ProductAlias[] = [];
  readonly removeCalls: string[] = [];

  private readonly aliases = new Map<string, ProductAlias>();
  private readonly failures = new Map<ProductRepositoryOperation, ProductPersistenceFailure>();

  constructor(initialAliases: readonly ProductAlias[] = []) {
    for (const alias of initialAliases) this.aliases.set(alias.id, alias);
  }

  failNext(operation: ProductRepositoryOperation, message: string): void {
    this.failures.set(operation, { code: "persistence", operation, message });
  }

  async create(alias: ProductAlias): Promise<Result<void, ProductAliasRepositoryWriteError>> {
    this.createCalls.push(alias);
    const failure = this.takeFailure("create_alias");
    if (failure !== null) return err(failure);

    const conflict = [...this.aliases.values()].some(
      (candidate) =>
        candidate.productId === alias.productId &&
        candidate.sourceKey?.toLocaleLowerCase("vi") === alias.sourceKey?.toLocaleLowerCase("vi") &&
        candidate.normalizedAlias === alias.normalizedAlias,
    );
    if (conflict) return err({ code: "alias_conflict", alias: alias.alias });

    this.aliases.set(alias.id, alias);
    return ok(undefined);
  }

  async remove(aliasId: string): Promise<Result<void, ProductPersistenceFailure>> {
    this.removeCalls.push(aliasId);
    const failure = this.takeFailure("remove_alias");
    if (failure !== null) return err(failure);

    if (!this.aliases.delete(aliasId)) {
      return err({
        code: "persistence",
        operation: "remove_alias",
        message: "Alias does not exist.",
      });
    }
    return ok(undefined);
  }

  async listForActiveProducts(): Promise<
    Result<readonly ProductAlias[], ProductPersistenceFailure>
  > {
    const failure = this.takeFailure("list_aliases");
    return failure === null ? ok([...this.aliases.values()]) : err(failure);
  }

  private takeFailure(operation: ProductRepositoryOperation): ProductPersistenceFailure | null {
    const failure = this.failures.get(operation) ?? null;
    this.failures.delete(operation);
    return failure;
  }
}
