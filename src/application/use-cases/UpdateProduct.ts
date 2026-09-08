import { Product, ProductValidationError } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import type { ProductCatalogError } from "../errors/ProductCatalogError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { isUuidV4 } from "../shared/Uuid";
import { mapDomainValidation, productNotFound, validationFailure } from "./ProductUseCaseSupport";

export interface ExistingProductUnitInput {
  readonly kind: "existing";
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

export interface NewProductUnitInput {
  readonly kind: "new";
  readonly name: string;
  readonly price: number;
}

export type UpdateProductUnitInput = ExistingProductUnitInput | NewProductUnitInput;

export interface UpdateProductInput {
  readonly productId: string;
  readonly sku: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly units: readonly UpdateProductUnitInput[];
}

export class UpdateProduct {
  constructor(
    private readonly repository: ProductRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateProductInput): Promise<Result<Product, ProductCatalogError>> {
    if (!isUuidV4(input.productId)) {
      return err(validationFailure("productId must be a valid UUID v4."));
    }

    const found = await this.repository.findById(input.productId);

    if (!found.ok) {
      return err(found.error);
    }

    if (found.value === null) {
      return err(productNotFound(input.productId));
    }

    let product: Product;

    try {
      const now = this.clock.now();
      const units = this.reconcileUnits(found.value, input.units, now);
      product = found.value.update({
        sku: input.sku,
        name: input.name,
        brand: input.brand,
        category: input.category,
        units,
        updatedAt: now,
      });
    } catch (error) {
      return err(mapDomainValidation(error));
    }

    const persisted = await this.repository.update(product);

    return persisted.ok ? ok(product) : err(persisted.error);
  }

  private reconcileUnits(
    product: Product,
    inputs: readonly UpdateProductUnitInput[],
    updatedAt: string,
  ): readonly Unit[] {
    if (!Array.isArray(inputs)) {
      throw new ProductValidationError("units must be an array.");
    }

    const existingById = new Map(product.units.map((unit) => [unit.id, unit]));
    const submittedById = new Map<string, ExistingProductUnitInput>();
    const newInputs: NewProductUnitInput[] = [];

    for (const input of inputs) {
      if (input === null || typeof input !== "object") {
        throw new ProductValidationError("Each Unit input must be an object.");
      }

      if (input.kind === "new") {
        newInputs.push(input);
        continue;
      }

      if (input.kind !== "existing" || !isUuidV4(input.id)) {
        throw new ProductValidationError("Existing Unit id must be a valid UUID v4.");
      }

      if (submittedById.has(input.id)) {
        throw new ProductValidationError("An existing Unit can only be submitted once.");
      }

      const existing = existingById.get(input.id);

      if (existing === undefined) {
        throw new ProductValidationError("Submitted Unit does not belong to this Product.");
      }

      if (!existing.isActive) {
        throw new ProductValidationError("Inactive Units cannot be edited or reactivated.");
      }

      submittedById.set(input.id, input);
    }

    const reconciled = product.units.map((unit) => {
      if (!unit.isActive) {
        return unit;
      }

      const submitted = submittedById.get(unit.id);

      return submitted === undefined
        ? unit.deactivate(updatedAt)
        : unit.update({
            name: submitted.name,
            price: submitted.price,
            updatedAt,
          });
    });

    const created = newInputs.map((input) =>
      Unit.create({
        id: this.idGenerator.generate(),
        productId: product.id,
        name: input.name,
        price: input.price,
        createdAt: updatedAt,
      }),
    );

    return [...reconciled, ...created];
  }
}
