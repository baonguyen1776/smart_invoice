import { describe, expect, it } from "vitest";
import { Product } from "../../domain/entities/Product";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import { Unit } from "../../domain/entities/Unit";
import { FuseProductSearchIndex } from "./FuseProductSearchIndex";

const NOW = "2026-09-10T01:00:00.000Z";
const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_ID = "33333333-3333-4333-8333-333333333333";

function product(
  id: string,
  unitId: string,
  sku: string,
  brand: string,
  unitName: string,
  isActive = true,
): Product {
  const value = Product.create({
    id,
    sku,
    name: "Cà phê sữa",
    brand,
    category: "Đồ uống",
    createdAt: NOW,
    units: [
      Unit.create({
        id: unitId,
        productId: id,
        name: unitName,
        price: 20_000,
        createdAt: NOW,
      }),
    ],
  });
  return isActive ? value : value.deactivate(NOW);
}

function alias(id: string, productId: string, value: string): ProductAlias {
  return ProductAlias.create({ id, productId, alias: value, createdAt: NOW });
}

describe("FuseProductSearchIndex", () => {
  it("uses exact id/SKU precedence and performs accent-insensitive fuzzy alias search", () => {
    const first = product(
      FIRST_ID,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "CF-001",
      "Highlands",
      "Ly",
    );
    const second = product(
      SECOND_ID,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "CF-002",
      "Trung Nguyên",
      "Gói",
    );
    const index = new FuseProductSearchIndex();
    index.replace(
      [first, second],
      [alias("cccccccc-cccc-4ccc-8ccc-cccccccccccc", second.id, "cafe sua goi")],
    );

    expect(index.search(FIRST_ID.toUpperCase(), 10)[0]).toMatchObject({
      product: { id: FIRST_ID },
      matchedBy: "id",
      score: 0,
    });
    expect(index.search(" cf-002 ", 10)[0]).toMatchObject({
      product: { id: SECOND_ID },
      matchedBy: "sku",
      score: 0,
    });
    expect(index.search("càfé sữa gói", 10)[0]).toMatchObject({
      product: { id: SECOND_ID },
      matchedBy: "fuzzy",
      activeUnitNames: ["Gói"],
    });
  });

  it("keeps punctuation significant for exact SKU matching", () => {
    const hyphenated = product(
      FIRST_ID,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "CF-001",
      "Highlands",
      "Ly",
    );
    const spaced = product(
      SECOND_ID,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "CF 001",
      "Trung Nguyên",
      "Gói",
    );
    const index = new FuseProductSearchIndex();
    index.replace([hyphenated, spaced], []);

    expect(index.search("cf-001", 10)[0]).toMatchObject({
      product: { id: FIRST_ID },
      matchedBy: "sku",
    });
    expect(index.search("cf 001", 10)[0]).toMatchObject({
      product: { id: SECOND_ID },
      matchedBy: "sku",
    });
  });

  it("returns duplicate-name candidates with disambiguating brand/SKU/Unit context", () => {
    const first = product(
      FIRST_ID,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "CF-001",
      "Highlands",
      "Ly",
    );
    const second = product(
      SECOND_ID,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "CF-002",
      "Trung Nguyên",
      "Gói",
    );
    const index = new FuseProductSearchIndex();
    index.replace([first, second], []);

    const results = index.search("ca phe sua", 10);

    expect(results.map(({ product: value }) => [value.name, value.sku, value.brand])).toEqual([
      ["Cà phê sữa", "CF-001", "Highlands"],
      ["Cà phê sữa", "CF-002", "Trung Nguyên"],
    ]);
    expect(results.map((candidate) => candidate.activeUnitNames)).toEqual([["Ly"], ["Gói"]]);
  });

  it("excludes inactive Products and refreshes after Product and alias changes", () => {
    const active = product(
      FIRST_ID,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "CF-001",
      "Highlands",
      "Ly",
    );
    const inactive = product(
      INACTIVE_ID,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "CF-003",
      "Other",
      "Chai",
      false,
    );
    const searchableAlias = alias(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      active.id,
      "morning boost",
    );
    const index = new FuseProductSearchIndex();
    index.replace([active, inactive], []);

    expect(index.search("CF-003", 10)).toEqual([]);
    expect(index.search("morning boost", 10)).toEqual([]);

    index.upsertAlias(searchableAlias);
    expect(index.search("morning boost", 10)[0]?.product.id).toBe(FIRST_ID);

    index.removeAlias(searchableAlias.id);
    expect(index.search("morning boost", 10)).toEqual([]);

    index.removeProduct(active.id);
    expect(index.search("ca phe sua", 10)).toEqual([]);
  });
});
