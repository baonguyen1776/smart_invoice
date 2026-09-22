import { normalizeCatalogSearchText } from "./NormalizeCatalogSearchText";

const GENERIC_CATEGORY_ROOTS = new Set(["vpp"]);

/**
 * Converts a KiotViet category path into the catalog display value.
 * Generic roots such as VPP are omitted only when a more specific path exists.
 */
export function normalizeImportedProductCategory(value: string | null): string | null {
  if (value === null) return null;

  const parts = value
    .split(">>")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length > 1 && GENERIC_CATEGORY_ROOTS.has(normalizeCatalogSearchText(parts[0]))) {
    parts.shift();
  }

  return parts.length === 0 ? null : parts.join(" ");
}
