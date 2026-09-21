import type { Product } from "../entities/Product";
import { normalizeCatalogSearchText } from "./NormalizeCatalogSearchText";

export type ProductImportMatchEvidenceKind =
  "product-type" | "model" | "brand" | "description" | "category" | "unit" | "conflict";

export interface ProductImportMatchEvidence {
  readonly kind: ProductImportMatchEvidenceKind;
  readonly imported: string;
  readonly existing: string;
  readonly points: number;
  readonly explanation: string;
}

export interface ProductImportMatchInput {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly unitNames: readonly string[];
}

export interface ProductImportMatchScore {
  readonly product: Product;
  readonly score: number;
  readonly confidence: "high" | "medium" | "low" | "none";
  readonly evidence: readonly ProductImportMatchEvidence[];
}

interface NameFingerprint {
  readonly explicitBrand: string;
  readonly modelSuffix: string | null;
  readonly category: string;
  readonly unitNames: readonly string[];
  readonly modelPrefix: string | null;
  readonly normalized: string;
  readonly tokens: readonly string[];
  readonly wordTokens: readonly string[];
  readonly modelTokens: readonly string[];
  readonly productType: readonly string[];
  readonly brandForms: ReadonlySet<string>;
  readonly remainingWords: readonly string[];
}

export function scoreProductImportMatch(
  imported: ProductImportMatchInput,
  existing: Product,
): ProductImportMatchScore {
  return scorePreparedMatch(
    imported,
    existing,
    fingerprint(imported.name, imported.brand, imported.category, imported.unitNames),
    fingerprint(
      existing.name,
      existing.brand,
      existing.category,
      existing.units.filter((unit) => unit.isActive).map((unit) => unit.name),
    ),
  );
}

/** Prepare catalog names once per preview, rather than once per spreadsheet row. */
export function createProductImportMatcher(products: readonly Product[]) {
  const prepared = products
    .filter((product) => product.isActive)
    .map((product) => ({
      product,
      fingerprint: fingerprint(
        product.name,
        product.brand,
        product.category,
        product.units.filter((unit) => unit.isActive).map((unit) => unit.name),
      ),
    }));
  const buckets = new Map<string, Set<number>>();
  const keys = (value: NameFingerprint) => [
    `name:${value.normalized}`,
    `type:${value.productType.join(" ")}`,
    ...value.modelTokens.map((token) => `model:${token}`),
  ];
  prepared.forEach(({ fingerprint: value }, index) => {
    for (const key of keys(value)) {
      const entries = buckets.get(key) ?? new Set<number>();
      entries.add(index);
      buckets.set(key, entries);
    }
  });
  return (
    input: ProductImportMatchInput,
    excludedIds: ReadonlySet<string> = new Set(),
  ): readonly ProductImportMatchScore[] => {
    const inputFingerprint = fingerprint(input.name, input.brand, input.category, input.unitNames);
    const relevant = new Set(
      keys(inputFingerprint).flatMap((key) => [...(buckets.get(key) ?? [])]),
    );
    return [...relevant]
      .map((index) => prepared[index])
      .filter(({ product }) => !excludedIds.has(product.id))
      .map(({ product, fingerprint: existing }) =>
        scorePreparedMatch(input, product, inputFingerprint, existing),
      )
      .filter((match) => match.score >= 50)
      .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
      .slice(0, 3);
  };
}

function scorePreparedMatch(
  imported: ProductImportMatchInput,
  existing: Product,
  importedFingerprint: NameFingerprint,
  existingFingerprint: NameFingerprint,
): ProductImportMatchScore {
  const evidence: ProductImportMatchEvidence[] = [];
  let score = 0;

  if (
    importedFingerprint.productType.length > 0 &&
    arraysEqual(importedFingerprint.productType, existingFingerprint.productType)
  ) {
    score += 25;
    evidence.push({
      kind: "product-type",
      imported: importedFingerprint.productType.join(" "),
      existing: existingFingerprint.productType.join(" "),
      points: 25,
      explanation: "Cùng loại sản phẩm.",
    });
  } else if (
    importedFingerprint.productType.length > 0 &&
    existingFingerprint.productType.length > 0
  ) {
    score -= 30;
    evidence.push({
      kind: "conflict",
      imported: importedFingerprint.productType.join(" "),
      existing: existingFingerprint.productType.join(" "),
      points: -30,
      explanation: "Loại sản phẩm khác nhau.",
    });
  }

  const sharedModels = intersection(
    importedFingerprint.modelTokens,
    existingFingerprint.modelTokens,
  );
  const modelConflict =
    importedFingerprint.modelTokens.length > 0 &&
    existingFingerprint.modelTokens.length > 0 &&
    !arraysEqual(importedFingerprint.modelTokens, existingFingerprint.modelTokens);
  if (sharedModels.length > 0 && !modelConflict) {
    score += 35;
    evidence.push({
      kind: "model",
      imported: sharedModels.join(", "),
      existing: sharedModels.join(", "),
      points: 35,
      explanation: "Cùng mã model.",
    });
  } else if (modelConflict) {
    score -= 40;
    evidence.push({
      kind: "conflict",
      imported: importedFingerprint.modelTokens.join(", "),
      existing: existingFingerprint.modelTokens.join(", "),
      points: -40,
      explanation: "Mã model khác nhau.",
    });
  }

  const sharedBrandForm = firstSetIntersection(
    importedFingerprint.brandForms,
    existingFingerprint.brandForms,
  );
  const explicitBrandConflict =
    importedFingerprint.explicitBrand.includes(" ") &&
    existingFingerprint.explicitBrand.includes(" ") &&
    importedFingerprint.explicitBrand !== existingFingerprint.explicitBrand;
  const hasBrandMatch = sharedBrandForm !== null && !explicitBrandConflict;
  if (hasBrandMatch) {
    score += 20;
    evidence.push({
      kind: "brand",
      imported: imported.brand ?? sharedBrandForm!,
      existing: existing.brand ?? sharedBrandForm!,
      points: 20,
      explanation: "Thương hiệu hoặc dạng viết tắt khớp nhau.",
    });
  } else if (imported.brand !== null && existing.brand !== null) {
    score -= 25;
    evidence.push({
      kind: "conflict",
      imported: imported.brand,
      existing: existing.brand,
      points: -25,
      explanation: "Thương hiệu khác nhau.",
    });
  }

  if (!hasBrandMatch) {
    const descriptionSimilarity = jaccard(
      importedFingerprint.remainingWords,
      existingFingerprint.remainingWords,
    );
    const descriptionPoints = Math.round(descriptionSimilarity * 10);
    if (descriptionPoints > 0) {
      score += descriptionPoints;
      evidence.push({
        kind: "description",
        imported: importedFingerprint.remainingWords.join(" "),
        existing: existingFingerprint.remainingWords.join(" "),
        points: descriptionPoints,
        explanation: "Các từ mô tả còn lại tương đồng.",
      });
    }
  }

  const importedCategory = importedFingerprint.category;
  const existingCategory = existingFingerprint.category;
  if (importedCategory.length > 0 && importedCategory === existingCategory) {
    score += 5;
    evidence.push({
      kind: "category",
      imported: imported.category!,
      existing: existing.category!,
      points: 5,
      explanation: "Cùng nhóm hàng.",
    });
  }

  const importedUnits = importedFingerprint.unitNames;
  const existingUnits = existingFingerprint.unitNames;
  const sharedUnits = intersection(importedUnits, existingUnits);
  if (sharedUnits.length > 0) {
    score += 5;
    evidence.push({
      kind: "unit",
      imported: sharedUnits.join(", "),
      existing: sharedUnits.join(", "),
      points: 5,
      explanation: "Có đơn vị tính trùng nhau.",
    });
  }

  score = Math.max(0, Math.min(100, score));
  if (
    importedFingerprint.modelSuffix &&
    existingFingerprint.modelSuffix &&
    importedFingerprint.modelSuffix !== existingFingerprint.modelSuffix
  ) {
    evidence.push({
      kind: "conflict",
      imported: importedFingerprint.modelSuffix,
      existing: existingFingerprint.modelSuffix,
      points: -30,
      explanation: "Hậu tố model hoặc đơn vị quy cách khác nhau.",
    });
    score = Math.max(0, score - 30);
  }
  if (
    importedFingerprint.modelPrefix &&
    existingFingerprint.modelPrefix &&
    importedFingerprint.modelPrefix !== existingFingerprint.modelPrefix
  ) {
    evidence.push({
      kind: "conflict",
      imported: importedFingerprint.modelPrefix,
      existing: existingFingerprint.modelPrefix,
      points: -30,
      explanation: "Tiền tố model khác nhau.",
    });
    score = Math.max(0, score - 30);
  }
  const importedColors = colors(importedFingerprint.wordTokens);
  const existingColors = colors(existingFingerprint.wordTokens);
  const colorConflict =
    importedColors.length > 0 &&
    existingColors.length > 0 &&
    !arraysEqual(importedColors, existingColors);
  if (colorConflict) {
    evidence.push({
      kind: "conflict",
      imported: importedColors.join(" "),
      existing: existingColors.join(" "),
      points: -30,
      explanation: "Màu sắc khác nhau; cần kiểm tra biến thể.",
    });
    score = Math.max(0, score - 30);
  }
  // Identical names without a model/brand still deserve human review.
  if (importedFingerprint.normalized === existingFingerprint.normalized && score < 50) {
    evidence.push({
      kind: "description",
      imported: imported.name,
      existing: existing.name,
      points: 50 - score,
      explanation: "Tên chuẩn hóa giống nhau; chưa đủ thông tin để kết luận cùng sản phẩm.",
    });
    score = 50;
  }
  if (modelConflict || colorConflict || evidence.some((item) => item.kind === "conflict"))
    score = Math.min(score, 49);
  if (sharedModels.length === 0 && !hasBrandMatch) score = Math.min(score, 50);

  return {
    product: existing,
    score,
    confidence: score >= 80 ? "high" : score >= 65 ? "medium" : score >= 50 ? "low" : "none",
    evidence,
  };
}

function fingerprint(
  name: string,
  structuredBrand: string | null,
  category: string | null,
  unitNames: readonly string[],
): NameFingerprint {
  const normalized = normalizeCatalogSearchText(name)
    .replace(/\bviet bi\b/g, "but bi")
    .replace(/\bviet chi\b/g, "but chi");
  const tokens = splitAlphaNumeric(normalized);
  const wordTokens = tokens.filter(isWordToken);
  const modelTokens = tokens.filter(isModelToken).map(normalizeModelToken);
  const knownBrand = /\b(thien long|tl)(?=\b|\d)/.test(normalized) ? "thien long" : null;
  const brandWords = splitAlphaNumeric(
    normalizeCatalogSearchText(structuredBrand ?? knownBrand ?? ""),
  ).filter(isWordToken);
  const brandForms = makeBrandForms(brandWords);
  const typeWords = wordTokens.filter(
    (word) => !brandWords.includes(word) && !brandForms.has(word),
  );
  const knownType = [
    "but bi",
    "but chi",
    "but gel",
    "but long",
    "but xoa",
    "viet may",
    "muc viet",
    "bang keo",
    "gom",
    "tap",
    "sach",
  ].find((type) => ` ${normalized} `.includes(` ${type} `));
  const productType = knownType?.split(" ") ?? typeWords.slice(0, 2);
  const prefix = /\b([a-z]+)\s*\d/.exec(normalized)?.[1] ?? null;

  return {
    explicitBrand: normalizeCatalogSearchText(structuredBrand ?? ""),
    modelSuffix: /\d([a-z]+)\b/.exec(normalized)?.[1] ?? null,
    category: normalizeCatalogSearchText(category ?? ""),
    unitNames: unitNames.map(normalizeCatalogSearchText),
    modelPrefix:
      prefix &&
      !brandForms.has(prefix) &&
      !brandWords.includes(prefix) &&
      !productType.includes(prefix)
        ? prefix
        : null,
    normalized,
    tokens,
    wordTokens,
    modelTokens,
    productType,
    brandForms,
    remainingWords: wordTokens.slice(productType.length),
  };
}

function splitAlphaNumeric(value: string): readonly string[] {
  return value.match(/[\p{L}]+|[\p{N}]+/gu) ?? [];
}

function makeBrandForms(words: readonly string[]): ReadonlySet<string> {
  if (words.length === 0) return new Set();
  const phrase = words.join(" ");
  const compact = words.join("");
  const initials = words.map((word) => word[0]).join("");
  return new Set(
    [phrase, compact, ...(words.length > 1 ? [initials] : [])].filter((value) => value.length > 0),
  );
}

function isWordToken(value: string): boolean {
  return /^\p{L}+$/u.test(value);
}

function isModelToken(value: string): boolean {
  return /^\p{N}+$/u.test(value);
}

function colors(words: readonly string[]): string[] {
  return [
    ...new Set(
      words.flatMap((word, index) =>
        ["xanh", "do", "den", "tim", "hong", "vang", "trang"].includes(word)
          ? [
              word === "xanh" && ["la", "duong"].includes(words[index + 1])
                ? `${word} ${words[index + 1]}`
                : word,
            ]
          : [],
      ),
    ),
  ].sort();
}

function normalizeModelToken(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right);
  return [...new Set(left.filter((value) => rightValues.has(value)))];
}

function firstSetIntersection(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): string | null {
  for (const value of left) if (right.has(value)) return value;
  return null;
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const leftValues = new Set(left);
  const rightValues = new Set(right);
  const union = new Set([...leftValues, ...rightValues]);
  if (union.size === 0) return 0;
  return intersection([...leftValues], [...rightValues]).length / union.size;
}
