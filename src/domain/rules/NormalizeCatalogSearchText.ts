const COMBINING_MARKS = /\p{M}+/gu;
const SEARCH_SEPARATORS = /[^\p{L}\p{N}]+/gu;

/**
 * Canonical matching form for Product catalog text and aliases.
 *
 * NFKD decomposes accents and compatibility characters, Vietnamese đ/Đ is
 * folded explicitly, punctuation becomes a word boundary, and whitespace is
 * collapsed. Raw display values remain unchanged on their entities.
 */
export function normalizeCatalogSearchText(value: string): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .normalize("NFKD")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(COMBINING_MARKS, "")
    .replace(SEARCH_SEPARATORS, " ")
    .trim()
    .replace(/\s+/g, " ");
}
