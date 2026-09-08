import { Product, ProductValidationError } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import type { ProductCatalogError } from "../errors/ProductCatalogError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { mapDomainValidation } from "./ProductUseCaseSupport";

export interface CreateProductUnitInput {
  readonly name: string;
  readonly price: number;
}

export interface CreateProductInput {
  readonly name: string;
  readonly sku?: string | null;
  readonly brand?: string | null;
  readonly category?: string | null;
  readonly units: readonly CreateProductUnitInput[];
}

export class CreateProduct {
  constructor(
    private readonly repository: ProductRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateProductInput): Promise<Result<Product, ProductCatalogError>> {
    let product: Product;

    try {
      if (!Array.isArray(input.units)) {
        throw new ProductValidationError("units must be an array.");
      }

      const now = this.clock.now();
      const productId = this.idGenerator.generate();
      const units = input.units.map((unit) => {
        if (unit === null || typeof unit !== "object") {
          throw new ProductValidationError("Each Unit input must be an object.");
        }

        return Unit.create({
          id: this.idGenerator.generate(),
          productId,
          name: unit.name,
          price: unit.price,
          createdAt: now,
        });
      });

      product = Product.create({
        id: productId,
        sku: input.sku ?? null,
        name: input.name,
        brand: input.brand ?? null,
        category: input.category ?? null,
        createdAt: now,
        units,
      });
    } catch (error) {
      return err(mapDomainValidation(error));
    }

    const persisted = await this.repository.create(product);

    return persisted.ok ? ok(product) : err(persisted.error);
  }
}
