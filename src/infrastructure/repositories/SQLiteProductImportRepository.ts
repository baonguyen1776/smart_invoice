import { invoke } from "@tauri-apps/api/core";
import type {
  ProductImportRepository,
  ProductImportWrite,
  ProductImportWriteError,
} from "../../application/repositories/ProductImportRepository";
import { err, ok, type Result } from "../../application/shared/Result";
import type { Product } from "../../domain/entities/Product";
import type { ProductAlias } from "../../domain/entities/ProductAlias";
import type { CommandInvoker } from "./SQLiteProductRepository";

interface CommandError {
  readonly code?: unknown;
  readonly sku?: unknown;
  readonly alias?: unknown;
}

export class SQLiteProductImportRepository implements ProductImportRepository {
  constructor(private readonly commandInvoker: CommandInvoker = invoke) {}

  async apply(
    writes: readonly ProductImportWrite[],
  ): Promise<Result<void, ProductImportWriteError>> {
    try {
      await this.commandInvoker("import_products", {
        changes: writes.map((write) => ({
          kind: write.kind,
          product: toProductRecord(write.product),
          aliases: write.aliases.map(toAliasRecord),
        })),
      });
      return ok(undefined);
    } catch (error) {
      const commandError = asCommandError(error);
      if (commandError.code === "sku_conflict") {
        return err({
          code: "sku_conflict",
          sku: typeof commandError.sku === "string" ? commandError.sku : "",
        });
      }
      if (commandError.code === "alias_conflict") {
        return err({
          code: "alias_conflict",
          alias: typeof commandError.alias === "string" ? commandError.alias : "",
        });
      }
      return err({
        code: "persistence",
        operation: "import",
        message: "Database import operation failed.",
      });
    }
  }
}

function toProductRecord(product: Product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    category: product.category,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    units: product.units.map((unit) => ({
      id: unit.id,
      productId: unit.productId,
      name: unit.name,
      price: unit.price,
      isActive: unit.isActive,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    })),
  };
}

function toAliasRecord(alias: ProductAlias) {
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

function asCommandError(error: unknown): CommandError {
  return typeof error === "object" && error !== null ? (error as CommandError) : {};
}
