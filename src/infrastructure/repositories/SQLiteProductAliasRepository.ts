import { invoke } from "@tauri-apps/api/core";
import type {
  ProductAliasRepositoryWriteError,
  ProductPersistenceFailure,
} from "../../application/errors/ProductCatalogError";
import type { ProductAliasRepository } from "../../application/repositories/ProductAliasRepository";
import { err, ok, type Result } from "../../application/shared/Result";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import type { CommandInvoker } from "./SQLiteProductRepository";

interface ProductAliasRecord {
  readonly id: string;
  readonly productId: string;
  readonly alias: string;
  readonly normalizedAlias: string;
  readonly sourceKey: string | null;
  readonly sourceNameRaw: string | null;
  readonly unitName: string | null;
  readonly createdAt: string;
}

interface CommandError {
  readonly code?: unknown;
  readonly alias?: unknown;
}

export class SQLiteProductAliasRepository implements ProductAliasRepository {
  constructor(private readonly commandInvoker: CommandInvoker = invoke) {}

  async create(alias: ProductAlias): Promise<Result<void, ProductAliasRepositoryWriteError>> {
    try {
      await this.commandInvoker("create_product_alias", { alias: toRecord(alias) });
      return ok(undefined);
    } catch (error) {
      const commandError = asCommandError(error);
      if (commandError.code === "alias_conflict") {
        return err({
          code: "alias_conflict",
          alias: typeof commandError.alias === "string" ? commandError.alias : alias.alias,
        });
      }
      return err(persistenceFailure("create_alias"));
    }
  }

  async remove(aliasId: string): Promise<Result<void, ProductPersistenceFailure>> {
    try {
      await this.commandInvoker("remove_product_alias", { aliasId });
      return ok(undefined);
    } catch {
      return err(persistenceFailure("remove_alias"));
    }
  }

  async listForActiveProducts(): Promise<
    Result<readonly ProductAlias[], ProductPersistenceFailure>
  > {
    try {
      const records = (await this.commandInvoker(
        "list_active_product_aliases",
      )) as readonly ProductAliasRecord[];
      return ok(records.map((record) => ProductAlias.rehydrate(record)));
    } catch {
      return err(persistenceFailure("list_aliases"));
    }
  }
}

function toRecord(alias: ProductAlias): ProductAliasRecord {
  return {
    id: alias.id,
    productId: alias.productId,
    alias: alias.alias,
    normalizedAlias: alias.normalizedAlias,
    sourceKey: alias.sourceKey,
    sourceNameRaw: alias.sourceNameRaw,
    unitName: alias.unitName,
    createdAt: alias.createdAt,
  };
}

function persistenceFailure(
  operation: ProductPersistenceFailure["operation"],
): ProductPersistenceFailure {
  return {
    code: "persistence",
    operation,
    message: `Database ${operation} operation failed.`,
  };
}

function asCommandError(error: unknown): CommandError {
  return typeof error === "object" && error !== null ? (error as CommandError) : {};
}
