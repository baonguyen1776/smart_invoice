import { useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_RECEIPT_MEASUREMENTS,
  paginateInvoiceReceipt,
  receiptBlankRowCount,
  type ReceiptMeasurements,
} from "./PaginateInvoiceReceipt";

export function useReceiptPagination(
  itemCount: number,
  hasOldDebt: boolean,
  storeHeaderOverride?: boolean,
) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [measurements, setMeasurements] = useState<ReceiptMeasurements | null>(null);
  const [hasOversizedContent, setHasOversizedContent] = useState(false);
  const currentMeasurements =
    measurements?.rowHeights.length === itemCount
      ? measurements
      : {
          ...DEFAULT_RECEIPT_MEASUREMENTS,
          rowHeights: Array.from({ length: itemCount }, () => 25),
        };
  const pages = paginateInvoiceReceipt(currentMeasurements, hasOldDebt, storeHeaderOverride);
  const [blankRowHeight, setBlankRowHeight] = useState(25);
  const blankRowCount = receiptBlankRowCount(
    currentMeasurements,
    pages,
    hasOldDebt,
    blankRowHeight,
  );

  useLayoutEffect(() => {
    const root = paperRef.current;
    if (!root) return;
    let cancelled = false;
    function measure() {
      if (cancelled || !root) return;
      const paper = root.querySelector<HTMLElement>(".thu-ba-invoice-paper");
      if (!paper || !paper.clientHeight) return;
      const styles = getComputedStyle(paper);
      const blankRow = root.querySelector(".receipt-empty-row");
      if (blankRow) setBlankRowHeight(blankRow.getBoundingClientRect().height);
      const height = (selector: string) =>
        root.querySelector(selector)?.getBoundingClientRect().height ?? 0;
      const store = root.querySelector<HTMLElement>(".receipt-store-header");
      let shopHeaderHeight = store?.getBoundingClientRect().height ?? 0;
      if (store?.hidden) {
        // Measure the omitted block without changing the visible preview.
        const clone = store.cloneNode(true) as HTMLElement;
        clone.hidden = false;
        Object.assign(clone.style, {
          position: "absolute",
          visibility: "hidden",
          width: `${store.parentElement!.clientWidth}px`,
        });
        store.parentElement!.appendChild(clone);
        shopHeaderHeight = clone.getBoundingClientRect().height;
        clone.remove();
      }
      const next: ReceiptMeasurements = {
        availableHeight:
          paper.getBoundingClientRect().height -
          parseFloat(styles.paddingTop) -
          parseFloat(styles.paddingBottom) -
          2,
        shopHeaderHeight,
        titleAndCustomerHeight: height(".invoice-title") + height(".customer-info-section"),
        tableHeaderHeight: height("thead"),
        totalHeight: height(".thu-ba-total-row"),
        debtHeight: height(".receipt-old-debt-row") + height(".receipt-final-total-row"),
        rowHeights: Array.from(
          root.querySelectorAll(".item-row"),
          (row) => row.getBoundingClientRect().height,
        ),
      };
      setMeasurements((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      const measuredPages = paginateInvoiceReceipt(next, hasOldDebt, storeHeaderOverride);
      const oversized = measuredPages.some((page, index) => {
        const headerHeight =
          index === 0
            ? next.titleAndCustomerHeight +
              next.tableHeaderHeight +
              (page.showStoreHeader ? next.shopHeaderHeight : 0)
            : 0;
        const footerHeight =
          index === measuredPages.length - 1 ? next.totalHeight + next.debtHeight : 0;
        const bodyHeight = next.rowHeights
          .slice(page.startIndex, page.endIndex)
          .reduce((sum, height) => sum + height, 0);
        return headerHeight + bodyHeight + footerHeight > next.availableHeight;
      });
      setHasOversizedContent(oversized);
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    root
      .querySelectorAll(".item-row, .thu-ba-header, .customer-info-section, tfoot")
      .forEach((element) => observer?.observe(element));
    void document.fonts?.ready.then(measure);
    window.addEventListener("beforeprint", measure);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("beforeprint", measure);
    };
  });

  return { paperRef, pages, hasOversizedContent, blankRowCount };
}
