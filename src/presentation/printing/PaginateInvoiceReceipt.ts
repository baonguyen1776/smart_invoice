export interface ReceiptMeasurements {
  readonly availableHeight: number;
  readonly shopHeaderHeight: number;
  readonly titleAndCustomerHeight: number;
  readonly tableHeaderHeight: number;
  readonly totalHeight: number;
  readonly debtHeight: number;
  readonly rowHeights: readonly number[];
}

export interface ReceiptPage {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly showStoreHeader: boolean;
}

export const DEFAULT_RECEIPT_MEASUREMENTS = {
  availableHeight: 532,
  shopHeaderHeight: 58,
  titleAndCustomerHeight: 65,
  tableHeaderHeight: 32,
  totalHeight: 25,
  debtHeight: 50,
};

// Automatic preview minimizes sheet count; ties keep the shop identity. An
// explicit selection always wins, even when printing the shop costs a sheet.
export function paginateInvoiceReceipt(
  measurements: ReceiptMeasurements,
  hasOldDebt: boolean,
  storeHeaderOverride?: boolean,
): readonly ReceiptPage[] {
  if (storeHeaderOverride !== undefined)
    return paginateWithStoreHeader(measurements, hasOldDebt, storeHeaderOverride);
  const withHeader = paginateWithStoreHeader(measurements, hasOldDebt, true);
  const withoutHeader = paginateWithStoreHeader(measurements, hasOldDebt, false);
  return withoutHeader.length < withHeader.length ? withoutHeader : withHeader;
}

function paginateWithStoreHeader(
  m: ReceiptMeasurements,
  hasOldDebt: boolean,
  showStoreHeader: boolean,
): readonly ReceiptPage[] {
  const footerHeight = m.totalHeight + (hasOldDebt ? m.debtHeight : 0);
  let remainingHeight = m.rowHeights.reduce((sum, height) => sum + height, 0);
  const pages: ReceiptPage[] = [];
  let startIndex = 0;
  do {
    const first = pages.length === 0;
    const headerHeight = first
      ? m.tableHeaderHeight + m.titleAndCustomerHeight + (showStoreHeader ? m.shopHeaderHeight : 0)
      : 0;
    const capacity = m.availableHeight - headerHeight;
    const remainingCount = m.rowHeights.length - startIndex;
    // Fourteen remains the standard first sheet. Omitting the shop lets its
    // reclaimed space hold more rows; continuation sheets have no headers.
    const maxRows = first && showStoreHeader ? 14 : remainingCount;
    let endIndex = startIndex;
    if (remainingCount <= maxRows && remainingHeight + footerHeight <= capacity) {
      endIndex = m.rowHeights.length;
    } else {
      let used = 0;
      while (endIndex < m.rowHeights.length && endIndex - startIndex < maxRows) {
        const next = m.rowHeights[endIndex];
        const isLastItem = endIndex === m.rowHeights.length - 1;
        if (used + next + (isLastItem ? footerHeight : 0) > capacity) break;
        used += next;
        endIndex++;
      }
      // Oversized individual rows are rendered and reported by the measuring
      // hook rather than silently truncated or lost in pagination.
      if (endIndex === startIndex) endIndex++;
    }
    pages.push({ startIndex, endIndex, showStoreHeader: first && showStoreHeader });
    remainingHeight -= m.rowHeights
      .slice(startIndex, endIndex)
      .reduce((sum, height) => sum + height, 0);
    startIndex = endIndex;
  } while (startIndex < m.rowHeights.length);
  return pages;
}

// Decorative rows are added after real-item pagination. They can neither hide
// the shop nor move items/totals onto another sheet.
export function receiptBlankRowCount(
  measurements: ReceiptMeasurements,
  pages: readonly ReceiptPage[],
  hasOldDebt: boolean,
  blankRowHeight = 25,
): number {
  const count = measurements.rowHeights.length;
  if (pages.length !== 1 || count === 0 || count >= 14 || blankRowHeight <= 0) return 0;
  const used =
    measurements.titleAndCustomerHeight +
    measurements.tableHeaderHeight +
    (pages[0].showStoreHeader ? measurements.shopHeaderHeight : 0) +
    measurements.rowHeights.reduce((sum, height) => sum + height, 0) +
    measurements.totalHeight +
    (hasOldDebt ? measurements.debtHeight : 0);
  return Math.max(
    0,
    Math.min(14 - count, Math.floor((measurements.availableHeight - used) / blankRowHeight)),
  );
}
