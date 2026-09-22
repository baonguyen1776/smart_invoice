import { describe, expect, it } from "vitest";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type {
  ProductImportRepository,
  ProductImportWrite,
} from "../repositories/ProductImportRepository";
import { ok } from "../shared/Result";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { InMemoryProductAliasRepository } from "../../test/doubles/InMemoryProductAliasRepository";
import { InMemoryProductRepository } from "../../test/doubles/InMemoryProductRepository";
import { ApplyProductSpreadsheetImport } from "./ApplyProductSpreadsheetImport";
import type { ProductImportPreview } from "./PreviewProductSpreadsheetImport";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const NEW_UNIT_ID = "33333333-3333-4333-8333-333333333333";
const ALIAS_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-09-20T00:00:00.000Z";

describe("ApplyProductSpreadsheetImport", () => {
  it("requires a matching choice even after prices have been accepted", async () => {
    const repository = new RecordingImportRepository();
    const existing = existingProduct();
    const result = await useCase(existing, repository).execute({
      preview: updatePreview(existing),
      decisions: { TL027: { action: "pending", acceptedPrices: { 2: 3500, 3: 35000 } } },
    });
    expect(result.ok).toBe(false);
    expect(repository.writes).toHaveLength(0);
  });

  it("allows explicit skipping of invalid rows without persisting them", async () => {
    const repository = new RecordingImportRepository();
    const source = createPreview(7083.33);
    const result = await useCase(null, repository).execute({
      preview: {
        ...source,
        candidates: source.candidates.map((candidate) => ({ ...candidate, isBlocked: true })),
      },
      decisions: { TL027: { action: "skip" } },
    });
    expect(result).toMatchObject({ ok: true, value: { skipped: 1, created: 0 } });
    expect(repository.writes).toHaveLength(0);
  });

  it("rejects two independent groups targeting the same product before any write", async () => {
    const existing = existingProduct();
    const repository = new RecordingImportRepository();
    const source = updatePreview(existing);
    const result = await useCase(existing, repository).execute({
      preview: {
        ...source,
        candidates: [source.candidates[0], { ...source.candidates[0], key: "OTHER" }],
      },
      decisions: {
        TL027: { action: "update", productId: PRODUCT_ID },
        OTHER: { action: "update", productId: PRODUCT_ID },
      },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(repository.writes).toHaveLength(0);
  });
  it("merges safely without replacing metadata or existing unit prices", async () => {
    const existing = existingProduct();
    const importRepository = new RecordingImportRepository();
    const result = await useCase(existing, importRepository).execute({
      preview: updatePreview(existing),
      decisions: { TL027: { action: "update", productId: PRODUCT_ID } },
    });

    expect(result).toEqual({
      ok: true,
      value: { created: 0, updated: 1, skipped: 0, unitsCreated: 1, aliasesCreated: 1 },
    });
    const write = importRepository.writes[0];
    expect(write.kind).toBe("update");
    expect(write.product).toMatchObject({
      id: PRODUCT_ID,
      name: "Bút bi Thiên Long 027",
      brand: "Thiên Long",
      category: "Viết",
    });
    expect(write.product.units).toEqual([
      expect.objectContaining({ id: UNIT_ID, name: "Cây", price: 3200 }),
      expect.objectContaining({ id: NEW_UNIT_ID, name: "Hộp", price: 35_000 }),
    ]);
    expect(write.aliases).toEqual([
      expect.objectContaining({ id: ALIAS_ID, alias: "TL027-H", unitName: "Hộp" }),
    ]);
  });

  it("does not require or apply a source price for an existing unit during a safe merge", async () => {
    const existing = existingProduct();
    const importRepository = new RecordingImportRepository();
    const source = updatePreview(existing);
    const candidate = source.candidates[0];
    const previewWithUnresolvedExistingPrice: ProductImportPreview = {
      ...source,
      candidates: [
        {
          ...candidate,
          units: [
            {
              ...candidate.units[0],
              sourcePrice: 3500.5,
              acceptedPrice: null,
              suggestedPrice: 3501,
              requiresPriceDecision: true,
            },
            candidate.units[1],
          ],
        },
      ],
    };

    const result = await useCase(existing, importRepository).execute({
      preview: previewWithUnresolvedExistingPrice,
      decisions: { TL027: { action: "update", productId: PRODUCT_ID } },
    });

    expect(result.ok).toBe(true);
    expect(importRepository.writes[0].product.units).toEqual([
      expect.objectContaining({ id: UNIT_ID, name: "Cây", price: 3200 }),
      expect.objectContaining({ id: NEW_UNIT_ID, name: "Hộp", price: 35_000 }),
    ]);
  });

  it("does not apply a fractional price until the user confirms an integer", async () => {
    const importRepository = new RecordingImportRepository();
    const apply = useCase(null, importRepository);
    const preview = createPreview(7083.33);

    const unresolved = await apply.execute({ preview, decisions: {} });
    expect(unresolved).toEqual({
      ok: false,
      error: { code: "validation", message: "Giá của đơn vị Cây chưa được xác nhận." },
    });
    expect(importRepository.writes).toHaveLength(0);

    const accepted = await apply.execute({
      preview,
      decisions: { TL027: { action: "create", acceptedPrices: { 2: 7083 } } },
    });
    expect(accepted.ok).toBe(true);
    expect(importRepository.writes[0].product.units[0].price).toBe(7083);
  });
});

class RecordingImportRepository implements ProductImportRepository {
  writes: readonly ProductImportWrite[] = [];

  async apply(writes: readonly ProductImportWrite[]) {
    this.writes = writes;
    return ok(undefined);
  }
}

function useCase(existing: Product | null, importRepository: RecordingImportRepository) {
  const ids = [NEW_UNIT_ID, ALIAS_ID, PRODUCT_ID, UNIT_ID];
  const idGenerator: IdGenerator = { generate: () => ids.shift()! };
  const clock: Clock = { now: () => NOW };
  const searchIndex: ProductSearchIndex = {
    isReady: true,
    replace: () => undefined,
    upsertProduct: () => undefined,
    removeProduct: () => undefined,
    upsertAlias: () => undefined,
    removeAlias: () => undefined,
    search: () => [],
  };
  return new ApplyProductSpreadsheetImport(
    new InMemoryProductRepository(existing ? [existing] : []),
    new InMemoryProductAliasRepository(),
    importRepository,
    idGenerator,
    clock,
    searchIndex,
  );
}

function existingProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    sku: "TL027",
    name: "Bút bi Thiên Long 027",
    brand: "Thiên Long",
    category: "Viết",
    createdAt: NOW,
    units: [
      Unit.create({ id: UNIT_ID, productId: PRODUCT_ID, name: "Cây", price: 3200, createdAt: NOW }),
    ],
  });
}

function updatePreview(existing: Product): ProductImportPreview {
  return {
    sourceRowCount: 2,
    productCount: 1,
    unitCount: 2,
    candidates: [
      {
        key: "TL027",
        sku: "TL027",
        name: "Bút bi TL027",
        brand: null,
        category: "Viết",
        units: [unit(2, "TL027", "Cây", 3500), unit(3, "TL027-H", "Hộp", 35_000)],
        aliases: [{ alias: "TL027-H", unitName: "Hộp" }],
        sourceRows: [2, 3],
        issues: [],
        matchKind: "existing-sku",
        exactMatches: [existing],
        possibleMatches: [],
        requiresDecision: true,
        isBlocked: false,
      },
    ],
  };
}

function createPreview(price: number): ProductImportPreview {
  return {
    sourceRowCount: 1,
    productCount: 1,
    unitCount: 1,
    candidates: [
      {
        key: "TL027",
        sku: "TL027",
        name: "Bút bi TL027",
        brand: null,
        category: "Viết",
        units: [
          {
            sourceRowNumber: 2,
            sourceSku: "TL027",
            name: "Cây",
            sourcePrice: price,
            acceptedPrice: null,
            suggestedPrice: 7083,
            requiresPriceDecision: true,
          },
        ],
        aliases: [],
        sourceRows: [2],
        issues: [
          {
            code: "fractional_price",
            severity: "warning",
            message: "Giá có phần lẻ.",
            sourceRows: [2],
          },
        ],
        matchKind: "new",
        exactMatches: [],
        possibleMatches: [],
        requiresDecision: true,
        isBlocked: false,
      },
    ],
  };
}

function unit(row: number, sku: string, name: string, price: number) {
  return {
    sourceRowNumber: row,
    sourceSku: sku,
    name,
    sourcePrice: price,
    acceptedPrice: price,
    suggestedPrice: null,
    requiresPriceDecision: false,
  };
}
