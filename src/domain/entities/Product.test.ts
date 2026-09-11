import { describe, expect, it } from "vitest";
import { Product, ProductValidationError } from "./Product";
import { Unit } from "./Unit";

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_PRODUCT_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UNIT_ID = "6ba7b811-9dad-41d1-80b4-00c04fd430c8";
const SECOND_UNIT_ID = "6ba7b812-9dad-41d1-80b4-00c04fd430c8";
const CREATED_AT = "2026-09-08T08:00:00.000Z";
const UPDATED_AT = "2026-09-08T09:00:00.000Z";

type CreateUnitInput = Parameters<typeof Unit.create>[0];

function createUnit(overrides: Partial<CreateUnitInput> = {}): Unit {
  return Unit.create({
    id: UNIT_ID,
    productId: PRODUCT_ID,
    name: "Lon",
    price: 10_000,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

const validProductInput = {
  id: PRODUCT_ID,
  sku: "COCA-330",
  name: "Coca Cola",
  brand: "Coca-Cola",
  category: "Nước giải khát",
  createdAt: CREATED_AT,
  units: [createUnit()],
};

describe("Product", () => {
  describe("create", () => {
    it("creates an active Product and normalizes its text", () => {
      const product = Product.create({
        ...validProductInput,
        sku: " COCA-330 ",
        name: " Coca Cola ",
        brand: " Coca-Cola ",
        category: " Nước giải khát ",
      });

      expect(product.sku).toBe("COCA-330");
      expect(product.name).toBe("Coca Cola");
      expect(product.brand).toBe("Coca-Cola");
      expect(product.category).toBe("Nước giải khát");
      expect(product.isActive).toBe(true);
      expect(product.updatedAt).toBe(CREATED_AT);
      expect(product.units).toHaveLength(1);
    });

    it("accepts null optional fields", () => {
      const product = Product.create({
        ...validProductInput,
        sku: null,
        brand: null,
        category: null,
      });

      expect(product.sku).toBeNull();
      expect(product.brand).toBeNull();
      expect(product.category).toBeNull();
    });

    it.each([
      ["empty name", { name: "   " }],
      ["blank SKU", { sku: "   " }],
      ["blank brand", { brand: "   " }],
      ["blank category", { category: "   " }],
      ["invalid id", { id: "not-a-uuid" }],
      ["invalid timestamp", { createdAt: "2026-09-08" }],
    ])("rejects %s", (_caseName, changes) => {
      expect(() =>
        Product.create({
          ...validProductInput,
          ...changes,
        }),
      ).toThrow(ProductValidationError);
    });

    it("rejects a Product without Units", () => {
      expect(() => Product.create({ ...validProductInput, units: [] })).toThrow(
        ProductValidationError,
      );
    });

    it("rejects a Product without an active Unit", () => {
      const inactiveUnit = createUnit().deactivate(UPDATED_AT);

      expect(() => Product.create({ ...validProductInput, units: [inactiveUnit] })).toThrow(
        ProductValidationError,
      );
    });

    it("rejects a Unit owned by another Product", () => {
      expect(() =>
        Product.create({
          ...validProductInput,
          units: [createUnit({ productId: OTHER_PRODUCT_ID })],
        }),
      ).toThrow(ProductValidationError);
    });

    it("rejects duplicate Unit names case-insensitively", () => {
      expect(() =>
        Product.create({
          ...validProductInput,
          units: [createUnit(), createUnit({ id: SECOND_UNIT_ID, name: "lON" })],
        }),
      ).toThrow(ProductValidationError);
    });

    it("rejects duplicate Unit identities", () => {
      expect(() =>
        Product.create({
          ...validProductInput,
          units: [createUnit(), createUnit({ name: "Thùng" })],
        }),
      ).toThrow(ProductValidationError);
    });
  });

  describe("update", () => {
    it("accepts a reconciled aggregate state and preserves identity", () => {
      const product = Product.create(validProductInput);
      const deactivatedUnit = product.units[0]?.deactivate(UPDATED_AT);
      const newUnit = createUnit({
        id: SECOND_UNIT_ID,
        name: "Thùng",
        price: 240_000,
      });

      if (deactivatedUnit === undefined) {
        throw new Error("Expected the fixture to contain a Unit.");
      }

      const updatedProduct = product.update({
        sku: " COCA-NEW ",
        name: " Coca Cola mới ",
        brand: null,
        category: " Đồ uống ",
        units: [deactivatedUnit, newUnit],
        updatedAt: UPDATED_AT,
      });

      expect(updatedProduct.id).toBe(product.id);
      expect(updatedProduct.createdAt).toBe(product.createdAt);
      expect(updatedProduct.sku).toBe("COCA-NEW");
      expect(updatedProduct.name).toBe("Coca Cola mới");
      expect(updatedProduct.brand).toBeNull();
      expect(updatedProduct.category).toBe("Đồ uống");
      expect(updatedProduct.units).toEqual([deactivatedUnit, newUnit]);
      expect(updatedProduct.updatedAt).toBe(UPDATED_AT);
      expect(product.name).toBe("Coca Cola");
      expect(product.units).toEqual(validProductInput.units);
    });

    it("rejects an update that removes the last active Unit", () => {
      const product = Product.create(validProductInput);
      const inactiveUnit = createUnit().deactivate(UPDATED_AT);

      expect(() =>
        product.update({
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          category: product.category,
          units: [inactiveUnit],
          updatedAt: UPDATED_AT,
        }),
      ).toThrow(ProductValidationError);
    });
  });

  describe("deactivate", () => {
    it("returns an inactive Product without deactivating its Units", () => {
      const product = Product.create(validProductInput);

      const deactivatedProduct = product.deactivate(UPDATED_AT);

      expect(deactivatedProduct.isActive).toBe(false);
      expect(deactivatedProduct.id).toBe(product.id);
      expect(deactivatedProduct.createdAt).toBe(product.createdAt);
      expect(deactivatedProduct.updatedAt).toBe(UPDATED_AT);
      expect(deactivatedProduct.units[0]?.isActive).toBe(true);
      expect(product.isActive).toBe(true);
    });
  });

  describe("reactivate", () => {
    it("returns an active Product from an inactive one and updates updatedAt", () => {
      const product = Product.create(validProductInput).deactivate(UPDATED_AT);
      const reactivatedAt = "2026-09-12T01:00:00.000Z";

      const reactivatedProduct = product.reactivate(reactivatedAt);

      expect(reactivatedProduct.isActive).toBe(true);
      expect(reactivatedProduct.id).toBe(product.id);
      expect(reactivatedProduct.updatedAt).toBe(reactivatedAt);
      expect(product.isActive).toBe(false);
    });

    it("returns the same product if already active", () => {
      const product = Product.create(validProductInput);
      const reactivated = product.reactivate(UPDATED_AT);
      expect(reactivated).toBe(product);
    });
  });

  describe("rehydrate", () => {
    it("restores a valid inactive Product", () => {
      const product = Product.rehydrate({
        ...validProductInput,
        isActive: false,
        updatedAt: UPDATED_AT,
      });

      expect(product.isActive).toBe(false);
      expect(product.updatedAt).toBe(UPDATED_AT);
    });

    it("rejects a non-boolean active state", () => {
      expect(() =>
        Product.rehydrate({
          ...validProductInput,
          isActive: 1 as unknown as boolean,
          updatedAt: UPDATED_AT,
        }),
      ).toThrow(ProductValidationError);
    });
  });
});
