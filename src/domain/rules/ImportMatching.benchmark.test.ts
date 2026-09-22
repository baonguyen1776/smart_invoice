import { expect, it } from "vitest";
import { Product } from "../entities/Product";
import { Unit } from "../entities/Unit";
import { createProductImportMatcher, scoreProductImportMatch } from "./ScoreProductImportMatch";

it("measures prepared matching against direct scoring on the same catalog", () => {
  const now = "2026-09-20T00:00:00.000Z";
  const catalog = Array.from({ length: 2000 }, (_, i) => {
    const id = `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`;
    return Product.create({
      id,
      name: `Bút bi TL-${i + 1}`,
      brand: "Thiên Long",
      category: "Viết",
      sku: null,
      createdAt: now,
      units: [
        Unit.create({
          id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
          productId: id,
          name: "Cây",
          price: 4000,
          createdAt: now,
        }),
      ],
    });
  });
  const inputs = Array.from({ length: 30 }, (_, i) => ({
    name: `Viết bi Thiên Long ${i + 1}`,
    brand: "Thiên Long",
    category: "Viết",
    unitNames: ["Cây"],
  }));
  const start = performance.now();
  const expected = inputs.map((input) =>
    catalog
      .map((product) => scoreProductImportMatch(input, product))
      .filter((match) => match.score >= 50)
      .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
      .slice(0, 3),
  );
  const directMs = performance.now() - start;
  const prepareStart = performance.now();
  const matcher = createProductImportMatcher(catalog);
  const results = inputs.map((input) => matcher(input));
  const preparedMs = performance.now() - prepareStart;
  expect(results).toEqual(expected);
  console.info(
    JSON.stringify({
      products: 2000,
      imports: 30,
      directMs: Math.round(directMs),
      preparedIncludingIndexMs: Math.round(preparedMs),
    }),
  );
}, 30000);
