export function formatInvoiceAmount(value: number | bigint): string {
  return value < 0 ? `(${(-value).toLocaleString("vi-VN")})` : value.toLocaleString("vi-VN");
}
