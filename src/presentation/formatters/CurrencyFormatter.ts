/**
 * Utility functions for real-time VND currency formatting with thousands separator
 * and cursor position tracking.
 */

export const MAX_SAFE_VND = Number.MAX_SAFE_INTEGER;

/**
 * Strips all non-digit characters from string.
 */
export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formats a raw digit string or number with Vietnamese thousands separators (dot).
 * Examples:
 *   "3000000" -> "3.000.000"
 *   "0" -> "0"
 *   "" -> ""
 */
export function formatVndCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const rawStr =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(Math.floor(value))
        : ""
      : String(value);
  const digits = stripNonDigits(rawStr);
  if (!digits) return "";
  // Strip leading zeroes unless the value is strictly "0"
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Parses a currency string into an integer number.
 * Returns 0 if empty or invalid.
 */
export function parseVndCurrency(value: string): number {
  const digits = stripNonDigits(value);
  if (!digits) return 0;
  const num = Number(digits);
  return Number.isSafeInteger(num) ? num : MAX_SAFE_VND;
}

/**
 * Calculates the cursor position in the newly formatted value such that
 * exactly `targetDigitsBeforeCursor` raw digits remain to the left of the cursor.
 */
export function calculateNextCursorPosition(
  formattedValue: string,
  targetDigitsBeforeCursor: number,
): number {
  if (targetDigitsBeforeCursor <= 0) return 0;
  let seenDigits = 0;
  for (let i = 0; i < formattedValue.length; i++) {
    if (/\d/.test(formattedValue[i])) {
      seenDigits++;
      if (seenDigits === targetDigitsBeforeCursor) {
        return i + 1;
      }
    }
  }
  return formattedValue.length;
}

/**
 * Counts how many digit characters appear strictly to the left of `cursorPosition`
 * in `rawString`.
 */
export function countDigitsBeforeCursor(rawString: string, cursorPosition: number): number {
  const clampedPos = Math.max(0, Math.min(cursorPosition, rawString.length));
  let count = 0;
  for (let i = 0; i < clampedPos; i++) {
    if (/\d/.test(rawString[i])) {
      count++;
    }
  }
  return count;
}
