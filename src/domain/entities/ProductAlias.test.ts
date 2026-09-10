import { describe, expect, it } from "vitest";
import { ProductAlias } from "./ProductAlias";
import { normalizeCatalogSearchText } from "../rules/NormalizeCatalogSearchText";

const ALIAS_ID = "55555555-5555-4555-8555-555555555555";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-10T01:00:00.000Z";

describe("ProductAlias", () => {
  it("normalizes Vietnamese accents, đ, punctuation, and whitespace", () => {
    expect(normalizeCatalogSearchText("  CÀ-PHÊ   Sữa Đá  ")).toBe("ca phe sua da");

    const alias = ProductAlias.create({
      id: ALIAS_ID,
      productId: PRODUCT_ID,
      alias: "  Cà phê sữa đá  ",
      sourceKey: " tax:0123456789 ",
      sourceNameRaw: " Nhà phân phối Miền Nam ",
      unitName: " Thùng ",
      createdAt: NOW,
    });

    expect(alias.alias).toBe("Cà phê sữa đá");
    expect(alias.normalizedAlias).toBe("ca phe sua da");
    expect(alias.sourceKey).toBe("tax:0123456789");
    expect(alias.sourceNameRaw).toBe("Nhà phân phối Miền Nam");
    expect(alias.unitName).toBe("Thùng");
  });

  it("rejects invalid identity, empty metadata, and mismatched persisted normalization", () => {
    expect(() =>
      ProductAlias.create({
        id: "not-a-uuid",
        productId: PRODUCT_ID,
        alias: "Alias",
        createdAt: NOW,
      }),
    ).toThrow("id must be a valid UUID v4");

    expect(() =>
      ProductAlias.create({
        id: ALIAS_ID,
        productId: PRODUCT_ID,
        alias: "Alias",
        sourceKey: " ",
        createdAt: NOW,
      }),
    ).toThrow("sourceKey must not be empty");

    expect(() =>
      ProductAlias.rehydrate({
        id: ALIAS_ID,
        productId: PRODUCT_ID,
        alias: "Cà phê",
        normalizedAlias: "wrong",
        sourceKey: null,
        sourceNameRaw: null,
        unitName: null,
        createdAt: NOW,
      }),
    ).toThrow("normalizedAlias must match");

    expect(() =>
      ProductAlias.create({
        id: ALIAS_ID,
        productId: PRODUCT_ID,
        alias: "Alias",
        sourceNameRaw: "Issuer without a key",
        createdAt: NOW,
      }),
    ).toThrow("sourceNameRaw requires sourceKey");
  });
});
