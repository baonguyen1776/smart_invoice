import { invoke } from "@tauri-apps/api/core";
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
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";

interface UnitRecord {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProductRecord {
  readonly id: string;
  readonly sku: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly units: readonly UnitRecord[];
}

interface CommandError {
  readonly code?: unknown;
  readonly sku?: unknown;
  readonly message?: unknown;
}

export type CommandInvoker = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export class SQLiteProductRepository implements ProductRepository {
  constructor(private readonly commandInvoker: CommandInvoker = invoke) {}

  async create(product: Product): Promise<Result<void, ProductRepositoryWriteError>> {
    return this.write("create_product", "create", product);
  }

  async findById(productId: string): Promise<Result<Product | null, ProductPersistenceFailure>> {
    try {
      const record = (await this.commandInvoker("get_product", {
        productId,
      })) as ProductRecord | null;
      return ok(record === null ? null : rehydrateProduct(record));
    } catch {
      return err(mapPersistenceFailure("get"));
    }
  }

  async update(product: Product): Promise<Result<void, ProductRepositoryWriteError>> {
    return this.write("update_product", "update", product);
  }

  async deactivate(product: Product): Promise<Result<void, ProductPersistenceFailure>> {
    try {
      await this.commandInvoker("deactivate_product", { product: toRecord(product) });
      return ok(undefined);
    } catch {
      return err(mapPersistenceFailure("deactivate"));
    }
  }

  async list(
    filter: ProductActivityFilter,
  ): Promise<Result<readonly Product[], ProductPersistenceFailure>> {
    try {
      const records = (await this.commandInvoker("list_products", {
        filter,
      })) as readonly ProductRecord[];
      return ok(records.map(rehydrateProduct));
    } catch {
      return err(mapPersistenceFailure("list"));
    }
  }

  private async write(
    command: "create_product" | "update_product",
    operation: "create" | "update",
    product: Product,
  ): Promise<Result<void, ProductRepositoryWriteError>> {
    try {
      await this.commandInvoker(command, { product: toRecord(product) });
      return ok(undefined);
    } catch (error) {
      const commandError = asCommandError(error);
      if (commandError.code === "sku_conflict") {
        return err({
          code: "sku_conflict",
          sku: typeof commandError.sku === "string" ? commandError.sku : (product.sku ?? ""),
        });
      }
      return err(mapPersistenceFailure(operation));
    }
  }
}

function toRecord(product: Product): ProductRecord {
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

function rehydrateProduct(record: ProductRecord): Product {
  return Product.rehydrate({
    ...record,
    units: record.units.map((unit) => Unit.rehydrate(unit)),
  });
}

function mapPersistenceFailure(operation: ProductRepositoryOperation): ProductPersistenceFailure {
  return {
    code: "persistence",
    operation,
    message: `Database ${operation} operation failed.`,
  };
}

function asCommandError(error: unknown): CommandError {
  return typeof error === "object" && error !== null ? (error as CommandError) : {};
}
