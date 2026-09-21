import type {
  ProductSpreadsheetParseError,
  ProductSpreadsheetParser,
  ProductSpreadsheetRow,
} from "../ports/ProductSpreadsheetParser";
import type { ProductAliasRepository } from "../repositories/ProductAliasRepository";
import type { ProductRepository } from "../repositories/ProductRepository";
import type { ProductPersistenceFailure } from "../errors/ProductCatalogError";
import { err, ok, type Result } from "../shared/Result";
import type { Product } from "../../domain/entities/Product";
import { normalizeCatalogSearchText } from "../../domain/rules/NormalizeCatalogSearchText";
import { normalizeImportedProductCategory } from "../../domain/rules/NormalizeImportedProductCategory";
import {
  createProductImportMatcher,
  type ProductImportMatchScore,
} from "../../domain/rules/ScoreProductImportMatch";

export type ProductImportIssueSeverity = "warning" | "error";

export interface ProductImportIssue {
  readonly code:
    | "missing_sku"
    | "missing_name"
    | "missing_unit"
    | "invalid_price"
    | "fractional_price"
    | "zero_price"
    | "duplicate_sku"
    | "missing_base_product"
    | "duplicate_unit"
    | "metadata_mismatch"
    | "inactive_source_row";
  readonly severity: ProductImportIssueSeverity;
  readonly message: string;
  readonly sourceRows: readonly number[];
}

export interface ProductImportUnitCandidate {
  readonly sourceRowNumber: number;
  readonly sourceSku: string;
  readonly name: string;
  readonly sourcePrice: number | null;
  readonly acceptedPrice: number | null;
  readonly suggestedPrice: number | null;
  readonly requiresPriceDecision: boolean;
}

export type ProductImportMatchKind =
  | "new"
  | "existing-sku"
  | "inactive-sku"
  | "existing-alias"
  | "ambiguous-alias"
  | "possible-duplicate";

export interface ProductImportCandidate {
  readonly key: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly units: readonly ProductImportUnitCandidate[];
  readonly aliases: readonly { readonly alias: string; readonly unitName: string }[];
  readonly sourceRows: readonly number[];
  readonly issues: readonly ProductImportIssue[];
  readonly matchKind: ProductImportMatchKind;
  readonly exactMatches: readonly Product[];
  readonly possibleMatches: readonly ProductImportMatchScore[];
  readonly requiresDecision: boolean;
  readonly isBlocked: boolean;
}

export interface ProductImportPreview {
  readonly databaseProductCount?: number;
  readonly sourceRowCount: number;
  readonly productCount: number;
  readonly unitCount: number;
  readonly candidates: readonly ProductImportCandidate[];
}

export type ProductImportPreviewError = ProductSpreadsheetParseError | ProductPersistenceFailure;

interface CandidateDraft {
  readonly key: string;
  readonly baseRow: ProductSpreadsheetRow | null;
  readonly rows: readonly ProductSpreadsheetRow[];
  readonly issues: readonly ProductImportIssue[];
}

interface CatalogLookup {
  readonly productsById: ReadonlyMap<string, Product>;
  readonly productsBySku: ReadonlyMap<string, Product>;
  readonly aliases: ReadonlyMap<string, readonly Product[]>;
}

function catalogLookup(
  products: readonly Product[],
  aliases: readonly import("../../domain/entities/ProductAlias").ProductAlias[],
): CatalogLookup {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsBySku = new Map(
    products
      .filter((product) => product.sku !== null)
      .map((product) => [exactKey(product.sku!), product]),
  );
  const byAlias = new Map<string, Product[]>();
  for (const alias of aliases) {
    if (alias.sourceKey !== null && alias.sourceKey.toLowerCase() !== "kiotviet") continue;
    const product = productsById.get(alias.productId);
    if (product === undefined) continue;
    const matches = byAlias.get(alias.normalizedAlias) ?? [];
    matches.push(product);
    byAlias.set(alias.normalizedAlias, matches);
  }
  return { productsById, productsBySku, aliases: byAlias };
}

export class PreviewProductSpreadsheetImport {
  constructor(
    private readonly parser: ProductSpreadsheetParser,
    private readonly productRepository: ProductRepository,
    private readonly aliasRepository: ProductAliasRepository,
  ) {}

  async execute(
    workbookBytes: ArrayBuffer,
  ): Promise<Result<ProductImportPreview, ProductImportPreviewError>> {
    const parsed = await this.parser.parse(workbookBytes);
    if (!parsed.ok) return err(parsed.error);

    const [products, aliases] = await Promise.all([
      this.productRepository.list("all"),
      this.aliasRepository.listForActiveProducts(),
    ]);
    if (!products.ok) return err(products.error);
    if (!aliases.ok) return err(aliases.error);

    const matcher = createProductImportMatcher(products.value);
    const lookup = catalogLookup(products.value, aliases.value);
    const candidates = groupRows(parsed.value).map((draft) =>
      finalizeCandidate(draft, lookup, matcher),
    );

    return ok({
      databaseProductCount: products.value.length,
      sourceRowCount: parsed.value.length,
      productCount: candidates.length,
      unitCount: candidates.reduce((sum, candidate) => sum + candidate.units.length, 0),
      candidates,
    });
  }
}

function groupRows(rows: readonly ProductSpreadsheetRow[]): readonly CandidateDraft[] {
  const rowsBySku = new Map<string, ProductSpreadsheetRow[]>();
  for (const row of rows) {
    const skuKey = exactKey(row.sku ?? "");
    const existing = rowsBySku.get(skuKey) ?? [];
    existing.push(row);
    rowsBySku.set(skuKey, existing);
  }

  const duplicateRows = new Set<number>();
  for (const [key, matches] of rowsBySku) {
    if (key.length === 0 || matches.length < 2) continue;
    for (const row of matches) duplicateRows.add(row.sourceRowNumber);
  }

  const baseRows = rows.filter((row) => row.baseUnitSku === null);
  const baseBySku = new Map(baseRows.map((row) => [exactKey(row.sku ?? ""), row]));
  const grouped = new Map<string, ProductSpreadsheetRow[]>();
  const orphanRows: ProductSpreadsheetRow[] = [];

  for (const row of rows) {
    const groupKey = exactKey(row.baseUnitSku ?? row.sku ?? "");
    if (row.baseUnitSku !== null && !baseBySku.has(groupKey)) {
      orphanRows.push(row);
      continue;
    }
    const current = grouped.get(groupKey) ?? [];
    current.push(row);
    grouped.set(groupKey, current);
  }

  const drafts: CandidateDraft[] = [...grouped.entries()].map(([key, groupedRows]) => {
    const baseRow = baseBySku.get(key) ?? null;
    return {
      key,
      baseRow,
      rows: groupedRows,
      issues: validateGroup(groupedRows, baseRow, duplicateRows),
    };
  });

  for (const row of orphanRows) {
    drafts.push({
      key: `orphan:${row.sourceRowNumber}`,
      baseRow: null,
      rows: [row],
      issues: [
        ...validateRow(row, duplicateRows),
        {
          code: "missing_base_product",
          severity: "error",
          message: `Không tìm thấy mã ĐVT cơ bản ${row.baseUnitSku ?? ""}.`,
          sourceRows: [row.sourceRowNumber],
        },
      ],
    });
  }

  return drafts.sort((left, right) => left.rows[0].sourceRowNumber - right.rows[0].sourceRowNumber);
}

function validateGroup(
  rows: readonly ProductSpreadsheetRow[],
  baseRow: ProductSpreadsheetRow | null,
  duplicateRows: ReadonlySet<number>,
): readonly ProductImportIssue[] {
  const issues = rows.flatMap((row) => validateRow(row, duplicateRows));
  if (baseRow === null) return issues;

  const units = new Map<string, number[]>();
  for (const row of rows) {
    const key = normalizeCatalogSearchText(row.unitName ?? "");
    const sourceRows = units.get(key) ?? [];
    sourceRows.push(row.sourceRowNumber);
    units.set(key, sourceRows);
  }
  for (const [unitName, sourceRows] of units) {
    if (unitName.length > 0 && sourceRows.length > 1) {
      issues.push({
        code: "duplicate_unit",
        severity: "error",
        message: `Đơn vị ${unitName} xuất hiện nhiều lần trong cùng sản phẩm.`,
        sourceRows,
      });
    }
  }

  const baseMetadata = [
    normalizeCatalogSearchText(baseRow.name ?? ""),
    normalizeCatalogSearchText(baseRow.brand ?? ""),
    normalizeCatalogSearchText(baseRow.categoryPath ?? ""),
  ].join("|");
  const mismatches = rows.filter((row) => {
    const metadata = [
      normalizeCatalogSearchText(row.name ?? ""),
      normalizeCatalogSearchText(row.brand ?? ""),
      normalizeCatalogSearchText(row.categoryPath ?? ""),
    ].join("|");
    return metadata !== baseMetadata;
  });
  if (mismatches.length > 0) {
    issues.push({
      code: "metadata_mismatch",
      severity: "warning",
      message: "Tên, thương hiệu hoặc nhóm hàng của đơn vị phụ khác dòng sản phẩm cơ bản.",
      sourceRows: mismatches.map((row) => row.sourceRowNumber),
    });
  }

  return issues;
}

function validateRow(
  row: ProductSpreadsheetRow,
  duplicateRows: ReadonlySet<number>,
): ProductImportIssue[] {
  const issues: ProductImportIssue[] = [];
  if (row.sku === null) issues.push(issue("missing_sku", "Thiếu mã hàng.", row, "error"));
  if (row.name === null) issues.push(issue("missing_name", "Thiếu tên hàng.", row, "error"));
  if (row.unitName === null) issues.push(issue("missing_unit", "Thiếu đơn vị tính.", row, "error"));

  const price = numericPrice(row.salePrice);
  if (price === null || price < 0 || !Number.isSafeInteger(Math.round(price))) {
    issues.push(
      issue(
        "invalid_price",
        "Giá bán không hợp lệ. Hãy nhập lại giá VND nguyên trước khi import.",
        row,
        "warning",
      ),
    );
  } else if (!Number.isInteger(price)) {
    issues.push(
      issue(
        "fractional_price",
        `Giá ${price} có phần lẻ và cần xác nhận giá VND nguyên.`,
        row,
        "warning",
      ),
    );
  } else if (price === 0) {
    issues.push(
      issue("zero_price", "Giá bán bằng 0 và cần được xác nhận hoặc chỉnh lại.", row, "warning"),
    );
  }

  if (duplicateRows.has(row.sourceRowNumber)) {
    issues.push(
      issue("duplicate_sku", `Mã hàng ${row.sku ?? ""} bị trùng trong file.`, row, "error"),
    );
  }
  if (row.isActive === false) {
    issues.push(
      issue(
        "inactive_source_row",
        "Sản phẩm đang ngừng kinh doanh trong file nguồn.",
        row,
        "warning",
      ),
    );
  }
  return issues;
}

function finalizeCandidate(
  draft: CandidateDraft,
  lookup: CatalogLookup,
  matcher: ReturnType<typeof createProductImportMatcher>,
): ProductImportCandidate {
  const baseRow = draft.baseRow ?? draft.rows[0];
  const sku = baseRow.sku ?? "";
  const name = baseRow.name ?? "";
  const category = normalizeImportedProductCategory(baseRow.categoryPath);
  const units = draft.rows.map((row): ProductImportUnitCandidate => {
    const sourcePrice = numericPrice(row.salePrice);
    const canSuggest =
      sourcePrice !== null && sourcePrice >= 0 && Number.isSafeInteger(Math.round(sourcePrice));
    const isAcceptedWithoutReview = canSuggest && Number.isInteger(sourcePrice) && sourcePrice > 0;
    const requiresPriceDecision = !isAcceptedWithoutReview;
    return {
      sourceRowNumber: row.sourceRowNumber,
      sourceSku: row.sku ?? "",
      name: row.unitName ?? "",
      sourcePrice,
      acceptedPrice: isAcceptedWithoutReview ? sourcePrice : null,
      suggestedPrice: canSuggest ? Math.round(sourcePrice) : null,
      requiresPriceDecision,
    };
  });
  const input = { name, brand: baseRow.brand, category, unitNames: units.map((unit) => unit.name) };
  const sourceSkuKeys = new Set(
    draft.rows.map((row) => exactKey(row.sku ?? "")).filter((key) => key.length > 0),
  );
  const sourceAliasKeys = new Set(
    draft.rows
      .map((row) => normalizeCatalogSearchText(row.sku ?? ""))
      .filter((key) => key.length > 0),
  );
  const skuMatches = uniqueProducts(
    [...sourceSkuKeys].flatMap((key) => {
      const product = lookup.productsBySku.get(key);
      return product ? [product] : [];
    }),
  );
  const aliasProducts = uniqueProducts(
    [...sourceAliasKeys].flatMap((key) => lookup.aliases.get(key) ?? []),
  );
  const codeMatches = uniqueProducts([...skuMatches, ...aliasProducts]);
  const possibleMatches = matcher(input, new Set(codeMatches.map((product) => product.id)));

  let matchKind: ProductImportMatchKind = "new";
  let exactMatches: readonly Product[] = [];
  if (codeMatches.length > 1) {
    matchKind = "ambiguous-alias";
    exactMatches = codeMatches;
  } else if (skuMatches.length === 1) {
    matchKind = skuMatches[0].isActive ? "existing-sku" : "inactive-sku";
    exactMatches = skuMatches;
  } else if (aliasProducts.length === 1) {
    matchKind = "existing-alias";
    exactMatches = aliasProducts;
  } else if (possibleMatches.length > 0) {
    matchKind = "possible-duplicate";
  }

  const isBlocked = draft.issues.some((candidateIssue) => candidateIssue.severity === "error");
  const requiresPriceDecision = units.some((unit) => unit.requiresPriceDecision);
  return {
    key: draft.key,
    sku,
    name,
    brand: baseRow.brand,
    category,
    units,
    aliases: draft.rows
      .filter((row) => row !== draft.baseRow && row.sku !== null && row.unitName !== null)
      .map((row) => ({ alias: row.sku!, unitName: row.unitName! })),
    sourceRows: draft.rows.map((row) => row.sourceRowNumber),
    issues: draft.issues,
    matchKind,
    exactMatches,
    possibleMatches,
    requiresDecision: !isBlocked && (requiresPriceDecision || matchKind !== "new"),
    isBlocked,
  };
}

function issue(
  code: ProductImportIssue["code"],
  message: string,
  row: ProductSpreadsheetRow,
  severity: ProductImportIssueSeverity,
): ProductImportIssue {
  return { code, message, severity, sourceRows: [row.sourceRowNumber] };
}

function numericPrice(value: ProductSpreadsheetRow["salePrice"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactKey(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("vi");
}

function uniqueProducts(products: readonly Product[]): readonly Product[] {
  return [...new Map(products.map((product) => [product.id, product])).values()];
}
