import { describe, expect, it } from "vitest";
import { Unit, UnitValidationError } from "./Unit";

const validInput = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  productId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  name: "Lon",
  price: 10_000,
  createdAt: "2026-09-08T08:00:00.000Z",
};

describe("Unit", () => {
  describe("create", () => {
    it("creates an active Unit with normalized name", () => {
      const unit = Unit.create({
        ...validInput,
        name: "  Lon  ",
      });

      expect(unit.name).toBe("Lon");
      expect(unit.price).toBe(10_000);
      expect(unit.isActive).toBe(true);
      expect(unit.updatedAt).toBe(validInput.createdAt);
    });

    it("accepts a zero price", () => {
      const unit = Unit.create({
        ...validInput,
        price: 0,
      });

      expect(unit.price).toBe(0);
    });

    it.each([
      ["empty name", { name: "   " }],
      ["negative price", { price: -1 }],
      ["fractional price", { price: 10.5 }],
      ["unsafe price", { price: Number.MAX_SAFE_INTEGER + 1 }],
      ["invalid id", { id: "not-a-uuid" }],
      ["invalid product id", { productId: "not-a-uuid" }],
      ["invalid timestamp", { createdAt: "2026-09-08" }],
    ])("rejects %s", (_caseName, changes) => {
      expect(() =>
        Unit.create({
          ...validInput,
          ...changes,
        }),
      ).toThrow(UnitValidationError);
    });
  });

  describe("update", () => {
    it("updates name and price while preserving identity", () => {
      const unit = Unit.create(validInput);

      const updatedUnit = unit.update({
        name: " Thùng ",
        price: 240_000,
        updatedAt: "2026-09-08T09:00:00.000Z",
      });

      expect(updatedUnit.name).toBe("Thùng");
      expect(updatedUnit.price).toBe(240_000);
      expect(updatedUnit.id).toBe(unit.id);
      expect(updatedUnit.productId).toBe(unit.productId);
      expect(updatedUnit.createdAt).toBe(unit.createdAt);
      expect(updatedUnit.updatedAt).toBe("2026-09-08T09:00:00.000Z");
      expect(unit.name).toBe("Lon");
      expect(unit.price).toBe(10_000);
      expect(unit.updatedAt).toBe(validInput.createdAt);
    });

    it.each([
      ["empty name", { name: "   " }],
      ["negative price", { price: -1 }],
      ["fractional price", { price: 10.5 }],
      ["unsafe price", { price: Number.MAX_SAFE_INTEGER + 1 }],
      ["invalid timestamp", { updatedAt: "2026-09-08" }],
    ])("rejects %s", (_caseName, changes) => {
      const unit = Unit.create(validInput);

      expect(() =>
        unit.update({
          updatedAt: "2026-09-08T09:00:00.000Z",
          ...changes,
        }),
      ).toThrow(UnitValidationError);
    });
  });

  describe("deactivate", () => {
    it("returns an inactive Unit without changing its identity", () => {
      const unit = Unit.create(validInput);

      const deactivatedUnit = unit.deactivate("2026-09-08T10:00:00.000Z");

      expect(deactivatedUnit.isActive).toBe(false);
      expect(deactivatedUnit.id).toBe(unit.id);
      expect(deactivatedUnit.productId).toBe(unit.productId);
      expect(deactivatedUnit.createdAt).toBe(unit.createdAt);
      expect(deactivatedUnit.updatedAt).toBe("2026-09-08T10:00:00.000Z");
      expect(unit.isActive).toBe(true);
      expect(unit.updatedAt).toBe(validInput.createdAt);
    });

    it("rejects an invalid update timestamp", () => {
      const unit = Unit.create(validInput);

      expect(() => unit.deactivate("2026-09-08")).toThrow(UnitValidationError);
    });
  });

  describe("rehydrate", () => {
    it("restores an inactive Unit", () => {
      const unit = Unit.rehydrate({
        ...validInput,
        isActive: false,
        updatedAt: "2026-09-08T10:00:00.000Z",
      });

      expect(unit.isActive).toBe(false);
      expect(unit.name).toBe("Lon");
      expect(unit.updatedAt).toBe("2026-09-08T10:00:00.000Z");
    });

    it("rejects a non-boolean active state", () => {
      expect(() =>
        Unit.rehydrate({
          ...validInput,
          isActive: 1 as unknown as boolean,
          updatedAt: validInput.createdAt,
        }),
      ).toThrow(UnitValidationError);
    });
  });
});
