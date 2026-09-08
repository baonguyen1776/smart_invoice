import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import { CreateProduct } from "./CreateProduct";
import { DeactivateProduct } from "./DeactivateProduct";
import { GetProduct } from "./GetProduct";
import { ListProducts } from "./ListProducts";
import { UpdateProduct } from "./UpdateProduct";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { InMemoryProductRepository } from "../../test/doubles/InMemoryProductRepository";

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_PRODUCT_ID = "123e4567-e89b-42d3-a456-426614174000";
const UNIT_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const SECOND_UNIT_ID = "6ba7b811-9dad-41d1-80b4-00c04fd430c8";
const INACTIVE_UNIT_ID = "6ba7b812-9dad-41d1-80b4-00c04fd430c8";
const NEW_UNIT_ID = "6ba7b813-9dad-41d1-80b4-00c04fd430c8";
const UNKNOWN_UNIT_ID = "6ba7b814-9dad-41d1-80b4-00c04fd430c8";
const NOW = "2026-09-09T01:00:00.000Z";
const EARLIER = "2026-09-08T08:00:00.000Z";

function fixedClock(): Clock {
  return { now: vi.fn(() => NOW) };
}

function sequenceIds(...ids: string[]): IdGenerator {
  let index = 0;

  return {
    generate: vi.fn(() => {
      const id = ids[index];
      index += 1;

      if (id === undefined) {
        throw new Error("Test ID sequence exhausted.");
      }

      return id;
    }),
  };
}

function makeProduct(
  options: {
    id?: string;
    name?: string;
    sku?: string | null;
    isActive?: boolean;
    units?: readonly Unit[];
  } = {},
): Product {
  const id = options.id ?? PRODUCT_ID;
  const units = options.units ?? [
    Unit.create({
      id: UNIT_ID,
      productId: id,
      name: "Lon",
      price: 10_000,
      createdAt: EARLIER,
    }),
  ];
  const product = Product.create({
    id,
    sku: options.sku ?? null,
    name: options.name ?? "Coca Cola",
    brand: null,
    category: null,
    createdAt: EARLIER,
    units,
  });

  return options.isActive === false ? product.deactivate(NOW) : product;
}

function expectErrorCode(
  result: { readonly ok: boolean; readonly error?: { readonly code: string } },
  code: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe(code);
}

describe("Product catalog use cases", () => {
  describe("CreateProduct", () => {
    it("creates and persists a Product with generated identity and null defaults", async () => {
      const repository = new InMemoryProductRepository();
      const useCase = new CreateProduct(repository, sequenceIds(PRODUCT_ID, UNIT_ID), fixedClock());

      const result = await useCase.execute({
        name: " Coca Cola ",
        units: [{ name: " Lon ", price: 10_000 }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe(PRODUCT_ID);
      expect(result.value.sku).toBeNull();
      expect(result.value.brand).toBeNull();
      expect(result.value.category).toBeNull();
      expect(result.value.units[0]?.id).toBe(UNIT_ID);
      expect(result.value.createdAt).toBe(NOW);
      expect(repository.createCalls).toHaveLength(1);
    });

    it("rejects invalid input without writing", async () => {
      const repository = new InMemoryProductRepository();
      const useCase = new CreateProduct(repository, sequenceIds(PRODUCT_ID), fixedClock());

      const result = await useCase.execute({ name: "Product", units: [] });

      expectErrorCode(result, "validation");
      expect(repository.createCalls).toHaveLength(0);
    });

    it.each([
      ["a non-array Unit collection", null],
      ["a null Unit entry", [null]],
    ])("maps %s to validation without writing", async (_caseName, units) => {
      const repository = new InMemoryProductRepository();
      const useCase = new CreateProduct(repository, sequenceIds(PRODUCT_ID, UNIT_ID), fixedClock());

      const result = await useCase.execute({
        name: "Coca Cola",
        units: units as unknown as [],
      });

      expectErrorCode(result, "validation");
      expect(repository.createCalls).toHaveLength(0);
    });

    it("allows duplicate Product names", async () => {
      const repository = new InMemoryProductRepository([makeProduct({ name: "Coca Cola" })]);
      const useCase = new CreateProduct(
        repository,
        sequenceIds(SECOND_PRODUCT_ID, SECOND_UNIT_ID),
        fixedClock(),
      );

      const result = await useCase.execute({
        name: "Coca Cola",
        units: [{ name: "Chai", price: 12_000 }],
      });

      expect(result.ok).toBe(true);
      expect(repository.createCalls).toHaveLength(1);
    });

    it("returns a typed SKU conflict", async () => {
      const repository = new InMemoryProductRepository([makeProduct({ sku: "COCA-330" })]);
      const useCase = new CreateProduct(
        repository,
        sequenceIds(SECOND_PRODUCT_ID, SECOND_UNIT_ID),
        fixedClock(),
      );

      const result = await useCase.execute({
        name: "Other Coca",
        sku: "coca-330",
        units: [{ name: "Chai", price: 12_000 }],
      });

      expectErrorCode(result, "sku_conflict");
    });

    it("returns persistence context when create fails", async () => {
      const repository = new InMemoryProductRepository();
      repository.failNext("create", "create unavailable");
      const useCase = new CreateProduct(repository, sequenceIds(PRODUCT_ID, UNIT_ID), fixedClock());

      const result = await useCase.execute({
        name: "Coca Cola",
        units: [{ name: "Lon", price: 10_000 }],
      });

      expectErrorCode(result, "persistence");
      if (result.ok || result.error.code !== "persistence") return;
      expect(result.error.operation).toBe("create");
    });
  });

  describe("GetProduct", () => {
    it("returns inactive Products by id", async () => {
      const inactiveProduct = makeProduct({ isActive: false });
      const useCase = new GetProduct(new InMemoryProductRepository([inactiveProduct]));

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.isActive).toBe(false);
    });

    it("returns not_found when the Product does not exist", async () => {
      const useCase = new GetProduct(new InMemoryProductRepository());

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expectErrorCode(result, "not_found");
    });

    it("returns persistence context when lookup fails", async () => {
      const repository = new InMemoryProductRepository();
      repository.failNext("get", "lookup unavailable");
      const useCase = new GetProduct(repository);

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expectErrorCode(result, "persistence");
      if (result.ok || result.error.code !== "persistence") return;
      expect(result.error.operation).toBe("get");
    });
  });

  describe("ListProducts", () => {
    it("lists active Products by default and supports inactive/all filters", async () => {
      const active = makeProduct();
      const inactive = makeProduct({
        id: SECOND_PRODUCT_ID,
        name: "Pepsi",
        isActive: false,
        units: [
          Unit.create({
            id: SECOND_UNIT_ID,
            productId: SECOND_PRODUCT_ID,
            name: "Chai",
            price: 12_000,
            createdAt: EARLIER,
          }),
        ],
      });
      const useCase = new ListProducts(new InMemoryProductRepository([active, inactive]));

      const activeResult = await useCase.execute();
      const inactiveResult = await useCase.execute({ activity: "inactive" });
      const allResult = await useCase.execute({ activity: "all" });

      expect(activeResult.ok && activeResult.value).toEqual([active]);
      expect(inactiveResult.ok && inactiveResult.value).toEqual([inactive]);
      expect(allResult.ok && allResult.value).toEqual([active, inactive]);
    });

    it("returns persistence context when listing fails", async () => {
      const repository = new InMemoryProductRepository();
      repository.failNext("list", "list unavailable");
      const useCase = new ListProducts(repository);

      const result = await useCase.execute();

      expectErrorCode(result, "persistence");
      if (result.ok || result.error.code !== "persistence") return;
      expect(result.error.operation).toBe("list");
    });
  });

  describe("UpdateProduct", () => {
    function productWithUnitHistory(): Product {
      const firstUnit = Unit.create({
        id: UNIT_ID,
        productId: PRODUCT_ID,
        name: "Lon",
        price: 10_000,
        createdAt: EARLIER,
      });
      const secondUnit = Unit.create({
        id: SECOND_UNIT_ID,
        productId: PRODUCT_ID,
        name: "Chai",
        price: 12_000,
        createdAt: EARLIER,
      });
      const inactiveUnit = Unit.create({
        id: INACTIVE_UNIT_ID,
        productId: PRODUCT_ID,
        name: "Lốc cũ",
        price: 55_000,
        createdAt: EARLIER,
      }).deactivate(NOW);

      return makeProduct({ units: [firstUnit, secondUnit, inactiveUnit] });
    }

    it("updates retained Units, soft-deactivates omitted Units, preserves history, and adds Units", async () => {
      const repository = new InMemoryProductRepository([productWithUnitHistory()]);
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: PRODUCT_ID,
        name: "Coca Cola mới",
        sku: null,
        brand: "Coca-Cola",
        category: null,
        units: [
          { kind: "existing", id: UNIT_ID, name: "Lon", price: 11_000 },
          { kind: "new", name: "Thùng", price: 240_000 },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.units).toHaveLength(4);
      expect(result.value.units.find((unit) => unit.id === UNIT_ID)?.price).toBe(11_000);
      expect(result.value.units.find((unit) => unit.id === SECOND_UNIT_ID)?.isActive).toBe(false);
      expect(result.value.units.find((unit) => unit.id === INACTIVE_UNIT_ID)?.isActive).toBe(false);
      expect(result.value.units.find((unit) => unit.id === NEW_UNIT_ID)?.isActive).toBe(true);
      expect(repository.updateCalls).toHaveLength(1);
    });

    it.each([
      [
        "unknown Unit id",
        [
          {
            kind: "existing" as const,
            id: UNKNOWN_UNIT_ID,
            name: "Unknown",
            price: 1,
          },
        ],
      ],
      [
        "inactive Unit id",
        [
          {
            kind: "existing" as const,
            id: INACTIVE_UNIT_ID,
            name: "Lốc cũ",
            price: 55_000,
          },
        ],
      ],
      [
        "duplicate submitted Unit id",
        [
          { kind: "existing" as const, id: UNIT_ID, name: "Lon", price: 1 },
          { kind: "existing" as const, id: UNIT_ID, name: "Lon", price: 1 },
        ],
      ],
    ])("rejects %s without writing", async (_caseName, units) => {
      const repository = new InMemoryProductRepository([productWithUnitHistory()]);
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: PRODUCT_ID,
        name: "Coca Cola",
        sku: null,
        brand: null,
        category: null,
        units,
      });

      expectErrorCode(result, "validation");
      expect(repository.updateCalls).toHaveLength(0);
    });

    it("rejects removal of every active Unit without writing", async () => {
      const repository = new InMemoryProductRepository([productWithUnitHistory()]);
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: PRODUCT_ID,
        name: "Coca Cola",
        sku: null,
        brand: null,
        category: null,
        units: [],
      });

      expectErrorCode(result, "validation");
      expect(repository.updateCalls).toHaveLength(0);
    });

    it("maps a null Unit entry to validation without writing", async () => {
      const repository = new InMemoryProductRepository([productWithUnitHistory()]);
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: PRODUCT_ID,
        name: "Coca Cola",
        sku: null,
        brand: null,
        category: null,
        units: [null] as unknown as [],
      });

      expectErrorCode(result, "validation");
      expect(repository.updateCalls).toHaveLength(0);
    });

    it("returns a typed SKU conflict from an update", async () => {
      const target = makeProduct({
        id: SECOND_PRODUCT_ID,
        name: "Pepsi",
        sku: "PEPSI",
        units: [
          Unit.create({
            id: SECOND_UNIT_ID,
            productId: SECOND_PRODUCT_ID,
            name: "Chai",
            price: 12_000,
            createdAt: EARLIER,
          }),
        ],
      });
      const repository = new InMemoryProductRepository([makeProduct({ sku: "COCA-330" }), target]);
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: SECOND_PRODUCT_ID,
        name: target.name,
        sku: "coca-330",
        brand: target.brand,
        category: target.category,
        units: [
          {
            kind: "existing",
            id: SECOND_UNIT_ID,
            name: "Chai",
            price: 12_000,
          },
        ],
      });

      expectErrorCode(result, "sku_conflict");
    });

    it("returns persistence context when update fails", async () => {
      const repository = new InMemoryProductRepository([makeProduct()]);
      repository.failNext("update", "update unavailable");
      const useCase = new UpdateProduct(repository, sequenceIds(NEW_UNIT_ID), fixedClock());

      const result = await useCase.execute({
        productId: PRODUCT_ID,
        name: "Coca Cola",
        sku: null,
        brand: null,
        category: null,
        units: [
          {
            kind: "existing",
            id: UNIT_ID,
            name: "Lon",
            price: 10_000,
          },
        ],
      });

      expectErrorCode(result, "persistence");
      if (result.ok || result.error.code !== "persistence") return;
      expect(result.error.operation).toBe("update");
    });
  });

  describe("DeactivateProduct", () => {
    it("soft-deactivates and persists an active Product", async () => {
      const repository = new InMemoryProductRepository([makeProduct()]);
      const useCase = new DeactivateProduct(repository, fixedClock());

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.isActive).toBe(false);
      expect(repository.deactivateCalls).toHaveLength(1);
    });

    it("is idempotent and avoids another repository write", async () => {
      const inactiveProduct = makeProduct({ isActive: false });
      const repository = new InMemoryProductRepository([inactiveProduct]);
      const useCase = new DeactivateProduct(repository, fixedClock());

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expect(result.ok).toBe(true);
      expect(repository.deactivateCalls).toHaveLength(0);
    });

    it("returns not_found for a missing Product", async () => {
      const useCase = new DeactivateProduct(new InMemoryProductRepository(), fixedClock());

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expectErrorCode(result, "not_found");
    });

    it("returns persistence context when deactivation fails", async () => {
      const repository = new InMemoryProductRepository([makeProduct()]);
      repository.failNext("deactivate", "deactivate unavailable");
      const useCase = new DeactivateProduct(repository, fixedClock());

      const result = await useCase.execute({ productId: PRODUCT_ID });

      expectErrorCode(result, "persistence");
      if (result.ok || result.error.code !== "persistence") return;
      expect(result.error.operation).toBe("deactivate");
    });
  });
});
