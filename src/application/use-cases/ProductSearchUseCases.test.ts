import { describe, expect, it, vi } from "vitest";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { FuseProductSearchIndex } from "../../infrastructure/search/FuseProductSearchIndex";
import { InMemoryProductAliasRepository } from "../../test/doubles/InMemoryProductAliasRepository";
import { InMemoryProductRepository } from "../../test/doubles/InMemoryProductRepository";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import { CreateProduct } from "./CreateProduct";
import { CreateProductAlias } from "./CreateProductAlias";
import { DeactivateProduct } from "./DeactivateProduct";
import { LoadProductSearchIndex } from "./LoadProductSearchIndex";
import { RemoveProductAlias } from "./RemoveProductAlias";
import { SearchProducts } from "./SearchProducts";
import { UpdateProduct } from "./UpdateProduct";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const ALIAS_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-10T01:00:00.000Z";
const LATER = "2026-09-10T02:00:00.000Z";

function clock(value = NOW): Clock {
  return { now: vi.fn(() => value) };
}

function ids(...values: string[]): IdGenerator {
  let index = 0;
  return {
    generate: vi.fn(() => {
      const value = values[index++];
      if (value === undefined) throw new Error("ID sequence exhausted.");
      return value;
    }),
  };
}

function existingProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: "CF-01",
    name: "Cà phê sữa",
    brand: "Việt",
    category: "Đồ uống",
    createdAt: NOW,
    units: [
      Unit.create({
        id: UNIT_ID,
        productId: PRODUCT_ID,
        name: "Ly",
        price: 25_000,
        createdAt: NOW,
      }),
    ],
  });
}

describe("Product search use cases", () => {
  it("loads active catalog data once and reports search readiness", async () => {
    const products = new InMemoryProductRepository([existingProduct()]);
    const aliases = new InMemoryProductAliasRepository();
    const productList = vi.spyOn(products, "list");
    const aliasList = vi.spyOn(aliases, "listForActiveProducts");
    const index = new FuseProductSearchIndex();
    const search = new SearchProducts(index);

    expect(search.execute({ query: "ca phe" })).toMatchObject({
      ok: false,
      error: { code: "search_not_ready" },
    });

    expect(await new LoadProductSearchIndex(products, aliases, index).execute()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(search.execute({ query: "ca phe" })).toMatchObject({
      ok: true,
      value: [{ product: { id: PRODUCT_ID } }],
    });
    search.execute({ query: "CF-01" });
    search.execute({ query: "do uong" });
    expect(productList).toHaveBeenCalledTimes(1);
    expect(aliasList).toHaveBeenCalledTimes(1);
  });

  it("refreshes only after committed Product create, edit, and deactivate writes", async () => {
    const repository = new InMemoryProductRepository();
    const index = new FuseProductSearchIndex();
    index.replace([], []);

    const created = await new CreateProduct(
      repository,
      ids(PRODUCT_ID, UNIT_ID),
      clock(),
      index,
    ).execute({
      name: "Cà phê sữa",
      sku: "CF-01",
      units: [{ name: "Ly", price: 25_000 }],
    });
    expect(created.ok).toBe(true);
    expect(index.search("ca phe", 10)[0]?.product.id).toBe(PRODUCT_ID);

    repository.failNext("update", "locked");
    const failedUpdate = await new UpdateProduct(repository, ids(), clock(LATER), index).execute({
      productId: PRODUCT_ID,
      name: "Không được lưu",
      sku: "CF-01",
      brand: null,
      category: null,
      units: [{ kind: "existing", id: UNIT_ID, name: "Ly", price: 25_000 }],
    });
    expect(failedUpdate.ok).toBe(false);
    expect(index.search("khong duoc luu", 10)).toEqual([]);

    const updated = await new UpdateProduct(repository, ids(), clock(LATER), index).execute({
      productId: PRODUCT_ID,
      name: "Cà phê rang",
      sku: "CF-01",
      brand: null,
      category: null,
      units: [{ kind: "existing", id: UNIT_ID, name: "Ly", price: 25_000 }],
    });
    expect(updated.ok).toBe(true);
    expect(index.search("ca phe rang", 10)[0]?.product.name).toBe("Cà phê rang");

    const deactivated = await new DeactivateProduct(repository, clock(LATER), index).execute({
      productId: PRODUCT_ID,
    });
    expect(deactivated.ok).toBe(true);
    expect(index.search("CF-01", 10)).toEqual([]);
  });

  it("persists global/source metadata aliases and refreshes after committed alias changes", async () => {
    const product = existingProduct();
    const products = new InMemoryProductRepository([product]);
    const aliases = new InMemoryProductAliasRepository();
    const index = new FuseProductSearchIndex();
    index.replace([product], []);

    const created = await new CreateProductAlias(
      products,
      aliases,
      ids(ALIAS_ID),
      clock(),
      index,
    ).execute({
      productId: PRODUCT_ID,
      alias: "morning boost",
      sourceKey: "tax:0123456789",
      sourceNameRaw: "Nhà phân phối Miền Nam",
      unitName: "Thùng",
    });

    expect(created.ok).toBe(true);
    expect(index.search("morning boost", 10)[0]?.product.id).toBe(PRODUCT_ID);

    aliases.failNext("remove_alias", "locked");
    expect((await new RemoveProductAlias(aliases, index).execute({ aliasId: ALIAS_ID })).ok).toBe(
      false,
    );
    expect(index.search("morning boost", 10)).toHaveLength(1);

    expect(await new RemoveProductAlias(aliases, index).execute({ aliasId: ALIAS_ID })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(index.search("morning boost", 10)).toEqual([]);
  });

  it("does not replace a ready index when either catalog load fails", async () => {
    const index = new FuseProductSearchIndex();
    index.replace([existingProduct()], []);
    const products = new InMemoryProductRepository();
    products.failNext("list", "unavailable");

    const result = await new LoadProductSearchIndex(
      products,
      new InMemoryProductAliasRepository(),
      index,
    ).execute();

    expect(result.ok).toBe(false);
    expect(index.search("CF-01", 10)).toHaveLength(1);
  });
});
