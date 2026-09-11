export interface InvoiceLineAmounts {
  readonly subtotal: number;
  readonly discountAmount: number;
  readonly payment: number;
}

export function calculateInvoiceLineAmounts(
  quantity: number,
  unitPrice: number,
  discountBasisPoints = 0,
): InvoiceLineAmounts {
  if (!Number.isSafeInteger(quantity) || quantity === 0)
    throw new Error("quantity must be a non-zero safe integer.");
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0)
    throw new Error("unitPrice must be a non-negative safe integer.");
  if (!Number.isInteger(discountBasisPoints) || discountBasisPoints < 0 || discountBasisPoints > 10_000)
    throw new Error("discountBasisPoints must be an integer from 0 to 10000.");
  const subtotal = quantity * unitPrice;
  if (!Number.isSafeInteger(subtotal)) throw new Error("subtotal exceeds the safe integer range.");
  // BigInt keeps half-away-from-zero VND rounding exact even near the safe-integer limit.
  const rawDiscount = BigInt(subtotal) * BigInt(discountBasisPoints);
  const discountAmount = Number(
    (rawDiscount >= 0n ? rawDiscount + 5_000n : rawDiscount - 5_000n) / 10_000n,
  );
  return { subtotal, discountAmount, payment: subtotal - discountAmount };
}

export function parseDiscountPercent(value: string): number {
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value)) throw new Error("CK phải từ 0–100%, tối đa 2 số thập phân.");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (basisPoints > 10_000) throw new Error("CK phải từ 0–100%, tối đa 2 số thập phân.");
  return basisPoints;
}

export function sumInvoiceAmounts(lines: readonly InvoiceLineAmounts[]): InvoiceLineAmounts {
  let subtotal = 0n;
  let discountAmount = 0n;
  let payment = 0n;
  for (const line of lines) {
    subtotal += BigInt(line.subtotal);
    discountAmount += BigInt(line.discountAmount);
    payment += BigInt(line.payment);
  }
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if ([subtotal, discountAmount, payment].some((amount) => amount < -max || amount > max))
    throw new Error("Invoice amounts exceed the safe integer range.");
  return { subtotal: Number(subtotal), discountAmount: Number(discountAmount), payment: Number(payment) };
}
