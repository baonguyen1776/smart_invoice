import { describe, expect, it } from "vitest";
import { DEFAULT_RECEIPT_MEASUREMENTS, paginateInvoiceReceipt } from "./PaginateInvoiceReceipt";

const measurements = (count: number, height = 25) => ({
  ...DEFAULT_RECEIPT_MEASUREMENTS,
  rowHeights: Array.from({ length: count }, () => height),
});

describe("A5 receipt pagination", () => {
  it("keeps 14 standard items without debt on the first sheet with the shop header", () => {
    expect(paginateInvoiceReceipt(measurements(14), false)).toEqual([
      { startIndex: 0, endIndex: 14, showStoreHeader: true },
    ]);
  });
  it("Case A: cuts the header before reducing the 14 item rows", () => {
    expect(paginateInvoiceReceipt(measurements(14), true)).toEqual([
      { startIndex: 0, endIndex: 14, showStoreHeader: false },
    ]);
  });
  it("Case B: keeps the header with nine actual item rows and debt", () => {
    expect(paginateInvoiceReceipt(measurements(9), true)).toEqual([
      { startIndex: 0, endIndex: 9, showStoreHeader: true },
    ]);
  });
  it("retains the header when both layouts require two sheets", () => {
    const pages = paginateInvoiceReceipt(measurements(14, 34), true);
    expect(pages).toEqual([
      { startIndex: 0, endIndex: 11, showStoreHeader: true },
      { startIndex: 11, endIndex: 14, showStoreHeader: false },
    ]);
  });
  it("moves the final item along with totals instead of creating a totals-only sheet", () => {
    expect(paginateInvoiceReceipt(measurements(14, 29), true, false)).toEqual([
      { startIndex: 0, endIndex: 13, showStoreHeader: false },
      { startIndex: 13, endIndex: 14, showStoreHeader: false },
    ]);
  });
  it("uses the extra space on continuation sheets and prints every item once", () => {
    const pages = paginateInvoiceReceipt(measurements(55), true);
    expect(pages).toHaveLength(3);
    expect(
      pages.flatMap((page) =>
        Array.from(
          { length: page.endIndex - page.startIndex },
          (_, index) => page.startIndex + index,
        ),
      ),
    ).toEqual(Array.from({ length: 55 }, (_, index) => index));
    expect(pages.slice(1).every((page) => !page.showStoreHeader)).toBe(true);
  });
  it("respects wrapped notes and customer information in the height budget", () => {
    const m = {
      ...measurements(9),
      titleAndCustomerHeight: 180,
      rowHeights: [90, ...Array.from({ length: 8 }, () => 45)],
    };
    const pages = paginateInvoiceReceipt(m, true);
    expect(pages[0].showStoreHeader).toBe(true);
    expect(pages).toHaveLength(2);
    for (const [index, page] of pages.entries()) {
      const body = m.rowHeights
        .slice(page.startIndex, page.endIndex)
        .reduce((sum, height) => sum + height, 0);
      const used =
        body +
        (index === 0
          ? m.tableHeaderHeight +
            m.titleAndCustomerHeight +
            (page.showStoreHeader ? m.shopHeaderHeight : 0)
          : 0) +
        (index === pages.length - 1 ? m.totalHeight + m.debtHeight : 0);
      expect(used).toBeLessThanOrEqual(m.availableHeight);
    }
  });
  it("preserves an explicitly omitted header and handles an empty draft", () => {
    expect(paginateInvoiceReceipt(measurements(0), false, false)).toEqual([
      { startIndex: 0, endIndex: 0, showStoreHeader: false },
    ]);
  });
});

it("respects explicit header choices even when they increase the sheet count", () => {
  const m = measurements(14);
  expect(paginateInvoiceReceipt(m, true)).toHaveLength(1);
  const manual = paginateInvoiceReceipt(m, true, true);
  expect(manual).toHaveLength(2);
  expect(manual[0].showStoreHeader).toBe(true);
  expect(paginateInvoiceReceipt(m, true, false)).toHaveLength(1);
});
it("uses continuation space without reserving height for a repeated table header", () => {
  const pages = paginateInvoiceReceipt(measurements(32), true, true);
  expect(pages).toEqual([
    { startIndex: 0, endIndex: 14, showStoreHeader: true },
    { startIndex: 14, endIndex: 32, showStoreHeader: false },
  ]);
});
it("chooses the minimum sheet count and favors the shop header on ties", () => {
  for (let count = 1; count <= 80; count++) {
    const m = measurements(count);
    const full = paginateInvoiceReceipt(m, true, true);
    const none = paginateInvoiceReceipt(m, true, false);
    const auto = paginateInvoiceReceipt(m, true);
    expect(auto).toHaveLength(Math.min(full.length, none.length));
    expect(auto[0].showStoreHeader).toBe(full.length <= none.length);
  }
});
