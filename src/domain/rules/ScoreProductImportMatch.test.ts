import { describe, expect, it } from "vitest";
import { Product } from "../entities/Product";
import { Unit } from "../entities/Unit";
import { createProductImportMatcher, scoreProductImportMatch } from "./ScoreProductImportMatch";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-20T00:00:00.000Z";

describe("scoreProductImportMatch", () => {
  it("recognizes regional names, reordered brands and single-digit models", () => {
    const result = scoreProductImportMatch(
      { name: "Thiên Long viết bi 8", brand: null, category: "Viết", unitNames: ["Cây"] },
      product({ name: "Bút bi TL-008", brand: null, category: "Viết" }),
    );
    expect(result.score).toBe(90);
  });

  it.each([
    ["Bút bi TL-08 đỏ", "Bút bi TL-08 xanh", "Thiên Long", "Thiên Long"],
    ["Bút bi AB08", "Bút bi CD08", null, null],
    ["Bút bi AB08X", "Bút bi AB08Y", "Thiên Long", "Thiên Long"],
    ["Bút bi TL-08 xanh lá", "Bút bi TL-08 xanh dương", "Thiên Long", "Thiên Long"],
    ["Bút bi TL-08 0.5mm", "Bút bi TL-08 0.7mm", "Thiên Long", "Thiên Long"],
    ["Bút bi 08", "Bút bi 08", "Thiên Long", "Thành Lợi"],
    ["Bút bi xanh", "Bút bi xịn", null, null],
  ])("does not suggest conflicting variants: %s / %s", (name, otherName, brand, otherBrand) => {
    const result = scoreProductImportMatch(
      { name, brand, category: "Viết", unitNames: ["Cây"] },
      product({ name: otherName, brand: otherBrand, category: "Viết" }),
    );
    expect(result.score).toBeLessThan(50);
  });

  it("keeps identical names without model or brand available for review", () => {
    const result = scoreProductImportMatch(
      { name: "Giấy ghi chú", brand: null, category: null, unitNames: [] },
      product({ name: "Giấy ghi chú", brand: null, category: null }),
    );
    expect(result.score).toBe(50);
    expect(result.confidence).toBe("low");
  });

  it("indexed matching returns the same eligible results as direct scoring", () => {
    const catalog = [
      "Bút bi TL-08",
      "Bút bi TL-027",
      "Giấy ghi chú",
      "Viết máy 008",
      "Bút bi TL-08 đỏ",
    ].map((name, index) =>
      Product.create({
        id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        name,
        brand: null,
        category: "Viết",
        sku: null,
        createdAt: NOW,
        units: [
          Unit.create({
            id: UNIT_ID,
            productId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
            name: "Cây",
            price: 4000,
            createdAt: NOW,
          }),
        ],
      }),
    );
    const matcher = createProductImportMatcher(catalog);
    for (const name of [
      "Bút bi thiên long 008",
      "Viết bi TL027",
      "Giấy ghi chú",
      "Bút bi TL08 xanh",
    ]) {
      const input = { name, brand: null, category: "Viết", unitNames: ["Cây"] };
      const expected = catalog
        .map((product) => scoreProductImportMatch(input, product))
        .filter((match) => match.score >= 50)
        .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
        .slice(0, 3);
      expect(matcher(input)).toEqual(expected);
    }
    expect(
      matcher(
        { name: "Bút bi TL-08", brand: null, category: null, unitNames: [] },
        new Set(catalog.map((product) => product.id)),
      ),
    ).toEqual([]);
  });
  it("explains Thiên Long and TL027 as a strong component match", () => {
    const result = scoreProductImportMatch(
      {
        name: "Bút bi TL027",
        brand: null,
        category: "Viết",
        unitNames: ["Cây"],
      },
      product({ name: "Bút bi Thiên Long 027", brand: null, category: "Viết" }),
    );

    expect(result.score).toBe(90);
    expect(result.confidence).toBe("high");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "product-type", points: 25 }),
        expect.objectContaining({ kind: "model", points: 35 }),
        expect.objectContaining({ kind: "brand", points: 20 }),
        expect.objectContaining({ kind: "category", points: 5 }),
        expect.objectContaining({ kind: "unit", points: 5 }),
      ]),
    );
  });

  it("penalizes conflicting model numbers", () => {
    const result = scoreProductImportMatch(
      { name: "Bút bi TL036", brand: null, category: "Viết", unitNames: ["Cây"] },
      product({ name: "Bút bi Thiên Long 027", brand: null, category: "Viết" }),
    );

    expect(result.score).toBeLessThan(50);
    expect(result.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "conflict", points: -40 })]),
    );
  });

  it("matches numeric models that only differ by leading zeroes", () => {
    const result = scoreProductImportMatch(
      {
        name: "Bút bi TL-08",
        brand: "Thiên Long",
        category: "Viết",
        unitNames: ["Cây", "Hộp"],
      },
      product({ name: "Bút bi thiên long 008", brand: "Thiên Long", category: "Bút bi" }),
    );

    expect(result.score).toBe(85);
    expect(result.confidence).toBe("high");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "model", points: 35 }),
        expect.objectContaining({ kind: "brand", points: 20 }),
      ]),
    );
    expect(result.evidence).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "conflict", points: -40 })]),
    );
  });

  it("caps generic name-only matches so they cannot look certain", () => {
    const result = scoreProductImportMatch(
      { name: "Bút bi xanh", brand: null, category: null, unitNames: [] },
      product({ name: "Bút bi đỏ", brand: null, category: null }),
    );

    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.confidence).not.toBe("high");
  });
});

function product(input: {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
}): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: "TL027",
    name: input.name,
    brand: input.brand,
    category: input.category,
    createdAt: NOW,
    units: [
      Unit.create({ id: UNIT_ID, productId: PRODUCT_ID, name: "Cây", price: 3500, createdAt: NOW }),
    ],
  });
}
