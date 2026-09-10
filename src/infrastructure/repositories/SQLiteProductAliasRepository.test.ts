import { describe, expect, it, vi } from "vitest";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import type { CommandInvoker } from "./SQLiteProductRepository";
import { SQLiteProductAliasRepository } from "./SQLiteProductAliasRepository";

const ALIAS_ID = "55555555-5555-4555-8555-555555555555";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-10T01:00:00.000Z";

function makeAlias(): ProductAlias {
  return ProductAlias.create({
    id: ALIAS_ID,
    productId: PRODUCT_ID,
    alias: "Cà phê sữa",
    sourceKey: "tax:0123456789",
    sourceNameRaw: "Nhà phân phối Miền Nam",
    unitName: "Thùng",
    createdAt: NOW,
  });
}

describe("SQLiteProductAliasRepository", () => {
  it("sends normalized aliases through typed commands and rehydrates reads", async () => {
    const alias = makeAlias();
    const invoker = vi
      .fn<CommandInvoker>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ ...alias }]);
    const repository = new SQLiteProductAliasRepository(invoker);

    expect(await repository.create(alias)).toEqual({ ok: true, value: undefined });
    expect(invoker).toHaveBeenCalledWith("create_product_alias", {
      alias: expect.objectContaining({ normalizedAlias: "ca phe sua" }),
    });

    const listed = await repository.listForActiveProducts();
    expect(listed.ok && listed.value[0]).toBeInstanceOf(ProductAlias);
  });

  it("maps conflicts and hides database diagnostics", async () => {
    const alias = makeAlias();
    const conflictInvoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue({ code: "alias_conflict", alias: alias.alias });
    const failureInvoker = vi
      .fn<CommandInvoker>()
      .mockRejectedValue(new Error("SELECT secret FROM product_aliases"));

    expect(await new SQLiteProductAliasRepository(conflictInvoker).create(alias)).toEqual({
      ok: false,
      error: { code: "alias_conflict", alias: alias.alias },
    });
    const failure = await new SQLiteProductAliasRepository(failureInvoker).remove(ALIAS_ID);
    expect(failure).toEqual({
      ok: false,
      error: {
        code: "persistence",
        operation: "remove_alias",
        message: "Database remove_alias operation failed.",
      },
    });
    expect(JSON.stringify(failure)).not.toContain("secret");
  });
});
