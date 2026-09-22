import type { ProductCatalogError, ProductValidationFailure } from "../errors/ProductCatalogError";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { ProductSearchIndex } from "../ports/ProductSearchIndex";
import type { ProductAliasRepository } from "../repositories/ProductAliasRepository";
import type {
  ProductImportRepository,
  ProductImportWrite,
  ProductImportWriteError,
} from "../repositories/ProductImportRepository";
import type { ProductRepository } from "../repositories/ProductRepository";
import { err, ok, type Result } from "../shared/Result";
import { Product } from "../../domain/entities/Product";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import { Unit } from "../../domain/entities/Unit";
import { normalizeCatalogSearchText } from "../../domain/rules/NormalizeCatalogSearchText";
import type {
  ProductImportCandidate,
  ProductImportPreview,
} from "./PreviewProductSpreadsheetImport";
import { mapDomainValidation, validationFailure } from "./ProductUseCaseSupport";

const KIOTVIET_SOURCE_KEY = "kiotviet";

export type ProductImportDecisionAction = "create" | "update" | "skip" | "pending";

export interface ProductImportDecision {
  readonly action: ProductImportDecisionAction;
  readonly productId?: string;
  readonly acceptedPrices?: Readonly<Record<number, number>>;
}

export interface ApplyProductSpreadsheetImportInput {
  readonly preview: ProductImportPreview;
  readonly decisions: Readonly<Record<string, ProductImportDecision>>;
}

export interface ProductSpreadsheetImportResult {
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly unitsCreated: number;
  readonly aliasesCreated: number;
}

export type ApplyProductSpreadsheetImportError =
  ProductValidationFailure | ProductCatalogError | ProductImportWriteError;

export class ApplyProductSpreadsheetImport {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly aliasRepository: ProductAliasRepository,
    private readonly importRepository: ProductImportRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly searchIndex: ProductSearchIndex,
  ) {}

  async execute(
    input: ApplyProductSpreadsheetImportInput,
  ): Promise<Result<ProductSpreadsheetImportResult, ApplyProductSpreadsheetImportError>> {
    const aliasesResult = await this.aliasRepository.listForActiveProducts();
    if (!aliasesResult.ok) return err(aliasesResult.error);

    const writes: ProductImportWrite[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let unitsCreated = 0;
    let aliasesCreated = 0;

    for (const candidate of input.preview.candidates) {
      const decision = input.decisions[candidate.key];
      if (decision?.action === "skip") {
        skipped += 1;
        continue;
      }
      if (candidate.isBlocked) {
        return err(
          validationFailure(`Sản phẩm ${candidate.sku || candidate.name} còn lỗi chưa xử lý.`),
        );
      }

      const action = decision?.action ?? (candidate.matchKind === "new" ? "create" : null);
      if (action === null || action === "pending") {
        return err(validationFailure(`Sản phẩm ${candidate.sku} cần chọn cập nhật hoặc bỏ qua.`));
      }

      const ignoredUnitNames =
        action === "update" && decision?.productId
          ? new Set(
              [
                ...candidate.exactMatches,
                ...candidate.possibleMatches.map((match) => match.product),
              ]
                .find((product) => product.id === decision.productId)
                ?.units.filter((unit) => unit.isActive)
                .map((unit) => normalizeCatalogSearchText(unit.name)) ?? [],
            )
          : new Set<string>();
      const prices = resolvePrices(candidate, decision?.acceptedPrices ?? {}, ignoredUnitNames);
      if (!prices.ok) return prices;

      if (action === "create") {
        if (candidate.matchKind !== "new" && candidate.matchKind !== "possible-duplicate") {
          return err(validationFailure(`Mã ${candidate.sku} đã tồn tại và không thể tạo mới.`));
        }
        const built = this.buildCreate(candidate, prices.value, aliasesResult.value);
        if (!built.ok) return built;
        writes.push(built.value);
        created += 1;
        unitsCreated += built.value.product.units.length;
        aliasesCreated += built.value.aliases.length;
        continue;
      }

      if (!decision?.productId) {
        return err(
          validationFailure(`Sản phẩm ${candidate.sku} chưa có sản phẩm đích để cập nhật.`),
        );
      }
      if (writes.some((write) => write.product.id === decision.productId)) {
        return err(
          validationFailure(
            "Nhiều dòng đang gộp vào cùng một sản phẩm. Hãy bỏ qua nhóm trùng và nhập từng nhóm để tránh ghi đè đơn vị.",
          ),
        );
      }
      const built = await this.buildUpdate(
        candidate,
        decision.productId,
        prices.value,
        aliasesResult.value,
      );
      if (!built.ok) return built;
      writes.push(built.value.write);
      updated += 1;
      unitsCreated += built.value.unitsCreated;
      aliasesCreated += built.value.write.aliases.length;
    }

    if (writes.length > 0) {
      const persisted = await this.importRepository.apply(writes);
      if (!persisted.ok) return err(persisted.error);
    }

    const [activeProducts, activeAliases] = await Promise.all([
      this.productRepository.list("active"),
      this.aliasRepository.listForActiveProducts(),
    ]);
    if (!activeProducts.ok) return err(activeProducts.error);
    if (!activeAliases.ok) return err(activeAliases.error);
    this.searchIndex.replace(activeProducts.value, activeAliases.value);

    return ok({ created, updated, skipped, unitsCreated, aliasesCreated });
  }

  private buildCreate(
    candidate: ProductImportCandidate,
    prices: ReadonlyMap<number, number>,
    existingAliases: readonly ProductAlias[],
  ): Result<ProductImportWrite, ProductValidationFailure> {
    try {
      const now = this.clock.now();
      const productId = this.idGenerator.generate();
      const product = Product.create({
        id: productId,
        sku: candidate.sku,
        name: candidate.name,
        brand: candidate.brand,
        category: candidate.category,
        createdAt: now,
        units: candidate.units.map((unit) =>
          Unit.create({
            id: this.idGenerator.generate(),
            productId,
            name: unit.name,
            price: prices.get(unit.sourceRowNumber)!,
            createdAt: now,
          }),
        ),
      });
      const aliases = buildAliases(
        candidate.aliases,
        product,
        candidate.name,
        existingAliases,
        this.idGenerator,
        now,
      );
      return ok({ kind: "create", product, aliases });
    } catch (error) {
      return err(mapDomainValidation(error));
    }
  }

  private async buildUpdate(
    candidate: ProductImportCandidate,
    productId: string,
    prices: ReadonlyMap<number, number>,
    existingAliases: readonly ProductAlias[],
  ): Promise<
    Result<
      { readonly write: ProductImportWrite; readonly unitsCreated: number },
      ProductCatalogError
    >
  > {
    const snapshot = [
      ...candidate.exactMatches,
      ...candidate.possibleMatches.map((match) => match.product),
    ].find((product) => product.id === productId);
    if (snapshot === undefined) {
      return err(
        validationFailure("Sản phẩm đích không nằm trong các kết quả matching đã review."),
      );
    }

    const found = await this.productRepository.findById(productId);
    if (!found.ok) return err(found.error);
    if (found.value === null) {
      return err({ code: "not_found", productId });
    }
    if (!found.value.isActive) {
      return err(validationFailure("Không thể import vào sản phẩm đang ngừng bán."));
    }
    if (found.value.updatedAt !== snapshot.updatedAt) {
      return err(
        validationFailure("Sản phẩm đã thay đổi sau khi preview. Hãy tải lại file để review."),
      );
    }

    try {
      const now = this.clock.now();
      const activeByName = new Map(
        found.value.units
          .filter((unit) => unit.isActive)
          .map((unit) => [normalizeCatalogSearchText(unit.name), unit]),
      );
      const inactiveNames = new Set(
        found.value.units
          .filter((unit) => !unit.isActive)
          .map((unit) => normalizeCatalogSearchText(unit.name)),
      );
      const newUnits: Unit[] = [];
      for (const imported of candidate.units) {
        const unitKey = normalizeCatalogSearchText(imported.name);
        if (activeByName.has(unitKey)) continue;
        if (inactiveNames.has(unitKey)) {
          return err(
            validationFailure(
              `Đơn vị ${imported.name} đã ngừng hoạt động và không thể tự động kích hoạt lại.`,
            ),
          );
        }
        newUnits.push(
          Unit.create({
            id: this.idGenerator.generate(),
            productId,
            name: imported.name,
            price: prices.get(imported.sourceRowNumber)!,
            createdAt: now,
          }),
        );
      }

      const product = found.value.update({
        sku: found.value.sku,
        name: found.value.name,
        brand: found.value.brand,
        category: found.value.category,
        units: [...found.value.units, ...newUnits],
        updatedAt: now,
      });
      const baseAliases =
        exactKey(candidate.sku) !== exactKey(product.sku ?? "")
          ? [
              { alias: candidate.sku, unitName: candidate.units[0]?.name ?? "" },
              ...candidate.aliases,
            ]
          : candidate.aliases;
      const aliases = buildAliases(
        baseAliases,
        product,
        candidate.name,
        existingAliases,
        this.idGenerator,
        now,
      );
      return ok({ write: { kind: "update", product, aliases }, unitsCreated: newUnits.length });
    } catch (error) {
      return err(mapDomainValidation(error));
    }
  }
}

function resolvePrices(
  candidate: ProductImportCandidate,
  acceptedPrices: Readonly<Record<number, number>>,
  ignoredUnitNames: ReadonlySet<string> = new Set(),
): Result<ReadonlyMap<number, number>, ProductValidationFailure> {
  const prices = new Map<number, number>();
  for (const unit of candidate.units) {
    if (ignoredUnitNames.has(normalizeCatalogSearchText(unit.name))) continue;
    const price = acceptedPrices[unit.sourceRowNumber] ?? unit.acceptedPrice;
    if (!Number.isSafeInteger(price) || price === null || price < 0) {
      return err(validationFailure(`Giá của đơn vị ${unit.name} chưa được xác nhận.`));
    }
    prices.set(unit.sourceRowNumber, price);
  }
  return ok(prices);
}

function buildAliases(
  aliases: readonly { readonly alias: string; readonly unitName: string }[],
  product: Product,
  sourceName: string,
  existingAliases: readonly ProductAlias[],
  idGenerator: IdGenerator,
  createdAt: string,
): readonly ProductAlias[] {
  const existingKeys = new Set(
    existingAliases
      .filter(
        (alias) =>
          alias.productId === product.id &&
          alias.sourceKey?.toLocaleLowerCase("vi") === KIOTVIET_SOURCE_KEY,
      )
      .map((alias) => alias.normalizedAlias),
  );
  const created: ProductAlias[] = [];
  for (const input of aliases) {
    const normalized = normalizeCatalogSearchText(input.alias);
    if (normalized.length === 0 || existingKeys.has(normalized)) continue;
    const alias = ProductAlias.create({
      id: idGenerator.generate(),
      productId: product.id,
      alias: input.alias,
      sourceKey: KIOTVIET_SOURCE_KEY,
      sourceNameRaw: sourceName,
      unitName: input.unitName,
      createdAt,
    });
    created.push(alias);
    existingKeys.add(alias.normalizedAlias);
  }
  return created;
}

function exactKey(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("vi");
}
