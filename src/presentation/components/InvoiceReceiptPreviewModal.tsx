import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { sumInvoiceAmountsExact } from "../../domain/rules/CalculateInvoiceAmounts";
import { formatInvoiceAmount } from "../formatters/FormatInvoiceAmount";
import { InvoiceIcon } from "./InvoiceIcon";
import "./InvoiceReceiptPreviewModal.css";

export interface CustomerReceiptInfo {
  readonly name?: string;
  readonly phone?: string;
  readonly address?: string;
  readonly note?: string;
}

export interface InvoiceReceiptPreviewModalProps {
  readonly invoice: Invoice | null;
  readonly customer?: CustomerReceiptInfo;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onPrint?: () => void;
  readonly onConfirmPrinted?: () => Promise<string | null>;
  readonly onNewDraft?: () => void;
  readonly onEdit?: () => void;
}

const SINGLE_PAGE_STANDARD_ROWS = 14;
const COMPACT_MODE_LIMIT = 16;
const MULTI_PAGE_ITEMS_PER_PAGE = 14;

interface InvoiceReceiptPage {
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly items: readonly InvoiceItem[];
  readonly startIndex: number;
  readonly emptyRowsCount: number;
  readonly isFirstPage: boolean;
  readonly isLastPage: boolean;
  readonly pageSubtotal: bigint;
  readonly pageDiscount: bigint;
  readonly pagePayment: bigint;
}

export function InvoiceReceiptPreviewModal(props: InvoiceReceiptPreviewModalProps) {
  if (!props.isOpen || !props.invoice) return null;
  return <ReceiptPreviewContent key={props.invoice.id} {...props} invoice={props.invoice} />;
}

function ReceiptPreviewContent({
  invoice,
  customer,
  isOpen,
  onClose,
  onPrint,
  onConfirmPrinted,
  onNewDraft,
  onEdit,
}: InvoiceReceiptPreviewModalProps & { readonly invoice: Invoice }) {
  const [awaitingPrintConfirmation, setAwaitingPrintConfirmation] = useState(false);
  const [isMarkingPrinted, setIsMarkingPrinted] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const printBusy = useRef(false);
  const [includeStoreHeader, setIncludeStoreHeader] = useState<boolean>(true);

  const totals = useMemo(() => {
    if (!invoice || invoice.items.length === 0) {
      return { subtotal: 0n, discountAmount: 0n, payment: 0n };
    }
    return sumInvoiceAmountsExact(invoice.items);
  }, [invoice]);

  const handlePrint = useCallback(() => {
    if (printBusy.current || awaitingPrintConfirmation) return;
    printBusy.current = true;
    setPrintError(null);
    try {
      if (onPrint) onPrint();
      else window.print();
      if (onConfirmPrinted) setAwaitingPrintConfirmation(true);
    } catch {
      setPrintError("Không thể mở hộp thoại in. Vui lòng thử lại.");
    } finally {
      printBusy.current = false;
    }
  }, [onPrint, onConfirmPrinted, awaitingPrintConfirmation]);

  async function confirmPrinted() {
    if (!onConfirmPrinted || printBusy.current) return;
    printBusy.current = true;
    setIsMarkingPrinted(true);
    setPrintError(null);
    try {
      const failure = await onConfirmPrinted();
      if (failure) setPrintError(failure);
      else setAwaitingPrintConfirmation(false);
    } catch {
      setPrintError("Chưa lưu được trạng thái đã in. Vui lòng thử lại.");
    } finally {
      printBusy.current = false;
      setIsMarkingPrinted(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (onNewDraft) {
          onNewDraft();
        } else {
          onClose();
        }
      } else if (event.key === "Enter") {
        const active = document.activeElement;
        const isButton = active instanceof HTMLButtonElement;
        // Trigger print on Enter unless user is specifically pressing another button
        if (!isButton || active.classList.contains("btn-receipt-print")) {
          event.preventDefault();
          handlePrint();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, onNewDraft, handlePrint]);

  const pages = useMemo<readonly InvoiceReceiptPage[]>(() => {
    if (!isOpen || !invoice) return [];
    const allItems = invoice.items;
    const totalCount = allItems.length;

    // Single page mode (<= 16 items)
    if (totalCount <= COMPACT_MODE_LIMIT) {
      const emptyCount = Math.max(0, SINGLE_PAGE_STANDARD_ROWS - totalCount);
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          items: allItems,
          startIndex: 0,
          emptyRowsCount: emptyCount,
          isFirstPage: true,
          isLastPage: true,
          pageSubtotal: totals.subtotal,
          pageDiscount: totals.discountAmount,
          pagePayment: totals.payment,
        },
      ];
    }

    // Multi-page mode (> 16 items) -> auto-split into pages
    const totalPages = Math.ceil(totalCount / MULTI_PAGE_ITEMS_PER_PAGE);
    const result: InvoiceReceiptPage[] = [];

    for (let p = 0; p < totalPages; p++) {
      const pageNumber = p + 1;
      const isFirst = p === 0;
      const isLast = p === totalPages - 1;
      const start = p * MULTI_PAGE_ITEMS_PER_PAGE;
      const pageItems = allItems.slice(start, start + MULTI_PAGE_ITEMS_PER_PAGE);
      const emptyCount = Math.max(0, MULTI_PAGE_ITEMS_PER_PAGE - pageItems.length);

      const pageTotals = sumInvoiceAmountsExact(pageItems);

      result.push({
        pageNumber,
        totalPages,
        items: pageItems,
        startIndex: start,
        emptyRowsCount: emptyCount,
        isFirstPage: isFirst,
        isLastPage: isLast,
        pageSubtotal: isLast ? totals.subtotal : pageTotals.subtotal,
        pageDiscount: isLast ? totals.discountAmount : pageTotals.discountAmount,
        pagePayment: isLast ? totals.payment : pageTotals.payment,
      });
    }

    return result;
  }, [invoice, totals, isOpen]);

  if (!isOpen || !invoice) {
    return null;
  }

  const resolvedCustomerName = customer?.name ?? invoice.customerName ?? "";
  const resolvedCustomerPhone = customer?.phone ?? invoice.customerPhone ?? "";
  const resolvedCustomerAddress =
    customer?.address ??
    invoice.customerAddress ??
    (resolvedCustomerPhone ? `SĐT: ${resolvedCustomerPhone}` : "");

  return (
    <div
      className="receipt-modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="receipt-modal-backdrop"
    >
      <div
        className="receipt-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="receipt-modal-toolbar no-print">
          <div className="receipt-toolbar-left">
            <InvoiceIcon name="receipt" size={18} />
            <h3 id="receipt-modal-title">Xem trước phiếu in hóa đơn</h3>
            <span className="receipt-invoice-code">
              #{String(invoice.invoiceNumber).padStart(6, "0")}
            </span>
            {pages.length > 1 && (
              <span className="receipt-multipage-badge">
                Hóa đơn {pages.length} trang (Tự động chia trang)
              </span>
            )}
          </div>
          <div className="receipt-toolbar-actions">
            <div className="receipt-toolbar-header-control">
              <label htmlFor="receipt-store-header-select">In tin cửa hàng:</label>
              <select
                id="receipt-store-header-select"
                value={includeStoreHeader ? "full" : "none"}
                onChange={(e) => setIncludeStoreHeader(e.target.value === "full")}
                className="receipt-header-select"
              >
                <option value="full">In</option>
                <option value="none">Không in</option>
              </select>
            </div>
            {onEdit && (
              <button
                type="button"
                className="secondary-button btn-receipt-edit"
                onClick={onEdit}
                title="Mở chỉnh sửa đơn này trên quầy thu ngân"
              >
                <InvoiceIcon name="edit" size={15} />
                Sửa hóa đơn
              </button>
            )}
            {onNewDraft && (
              <button
                type="button"
                className="secondary-button btn-receipt-new-draft"
                onClick={onNewDraft}
                title="Đóng xem trước và tạo ngay đơn mới (Esc)"
              >
                Đóng & Tạo đơn mới <kbd>Esc</kbd>
              </button>
            )}
            <button
              type="button"
              className="primary-button btn-receipt-print"
              onClick={handlePrint}
              disabled={awaitingPrintConfirmation || isMarkingPrinted}
              title="In hóa đơn (Enter)"
            >
              <InvoiceIcon name="receipt" size={15} />
              In hóa đơn <kbd>Enter</kbd>
            </button>
            <button
              type="button"
              className="btn-receipt-close"
              onClick={onClose}
              aria-label="Đóng cửa sổ xem trước"
            >
              <InvoiceIcon name="close" size={16} />
            </button>
          </div>
        </header>

        {printError && (
          <p className="no-print" role="alert">
            {printError}
          </p>
        )}
        {awaitingPrintConfirmation && (
          <div
            className="receipt-print-confirmation no-print"
            role="group"
            aria-label="Xác nhận kết quả in"
          >
            <p>Phiếu đã được in thành công chưa?</p>
            <button
              type="button"
              className="secondary-button"
              disabled={isMarkingPrinted}
              onClick={() => {
                setAwaitingPrintConfirmation(false);
                setPrintError(null);
              }}
            >
              Đã hủy / Chưa in
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={isMarkingPrinted}
              onClick={() => void confirmPrinted()}
            >
              {isMarkingPrinted ? "Đang lưu trạng thái…" : "Đã in thành công"}
            </button>
          </div>
        )}
        <div className="receipt-paper-scroll">
          {pages.map((page) => {
            const isCompact =
              page.totalPages === 1 && page.items.length > SINGLE_PAGE_STANDARD_ROWS;
            return (
              <div
                key={`receipt-page-${page.pageNumber}`}
                className={`thu-ba-invoice-paper ${isCompact ? "compact-mode" : ""} ${
                  !includeStoreHeader ? "no-store-header" : ""
                }`}
                id={page.pageNumber === 1 ? "thu-ba-invoice-print-area" : undefined}
              >
                {page.isFirstPage ? (
                  <div className="thu-ba-header">
                    {includeStoreHeader && (
                      <>
                        <h2 className="store-name">THU BA</h2>
                        <p className="store-address">
                          Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp
                        </p>
                        <p className="store-phone">SĐT : 0989,601,556 - 0984,831,636</p>
                      </>
                    )}
                    <h1 className="invoice-title">
                      HÓA ĐƠN
                      {page.totalPages > 1 && (
                        <span className="invoice-title-page-tag">
                          (Trang {page.pageNumber}/{page.totalPages})
                        </span>
                      )}
                    </h1>
                  </div>
                ) : (
                  <div className="thu-ba-header thu-ba-header-subpage">
                    <div className="subpage-header-row">
                      {includeStoreHeader && <span className="subpage-store-name">THU BA</span>}
                      <span className="subpage-invoice-title">HÓA ĐƠN (Tiếp theo)</span>
                      <span className="subpage-page-tag">
                        Trang {page.pageNumber}/{page.totalPages}
                      </span>
                    </div>
                    {includeStoreHeader && (
                      <p className="store-phone">SĐT : 0989,601,556 - 0984,831,636</p>
                    )}
                  </div>
                )}

                <div className="customer-info-section">
                  <div className="customer-row">
                    <span className="customer-row-label">Khách hàng:</span>
                    <span className="customer-row-val">{resolvedCustomerName}</span>
                  </div>
                  <div className="customer-row">
                    <span className="customer-row-label">Địa chỉ:</span>
                    <span className="customer-row-val">{resolvedCustomerAddress}</span>
                  </div>
                </div>

                <table className="thu-ba-table">
                  <colgroup>
                    <col className="col-stt" style={{ width: "3.5%" }} />
                    <col className="col-name" style={{ width: "32.5%" }} />
                    <col className="col-unit" style={{ width: "6.5%" }} />
                    <col className="col-qty" style={{ width: "5.5%" }} />
                    <col className="col-price" style={{ width: "11%" }} />
                    <col className="col-subtotal" style={{ width: "13%" }} />
                    <col className="col-ck" style={{ width: "4.5%" }} />
                    <col className="col-ck-amount" style={{ width: "10%" }} />
                    <col className="col-payment" style={{ width: "13.5%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-stt">Stt</th>
                      <th className="th-name">Tên hàng hóa</th>
                      <th className="th-unit">Đvt</th>
                      <th className="th-qty">Số lượng</th>
                      <th className="th-price">Đơn giá</th>
                      <th className="th-subtotal">Thành tiền</th>
                      <th className="th-ck">CK</th>
                      <th className="th-ck-amount">Tiền CK</th>
                      <th className="th-payment">Thanh toán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((item, index) => (
                      <tr key={item.id} className="item-row">
                        <td className="td-stt">{page.startIndex + index + 1}</td>
                        <td className="td-name">
                          <span className="item-product-name">{item.productName}</span>
                          {item.note && (
                            <span className="item-line-note">(Ghi chú: {item.note})</span>
                          )}
                        </td>
                        <td className="td-unit">{item.unitName}</td>
                        <td className="td-qty">{item.quantity}</td>
                        <td className="td-price">{item.unitPrice.toLocaleString("vi-VN")}</td>
                        <td className="td-subtotal">{formatInvoiceAmount(item.subtotal)}</td>
                        <td className="td-ck">
                          {item.discountBasisPoints > 0
                            ? `${item.discountBasisPoints / 100}%`
                            : "-"}
                        </td>
                        <td className="td-ck-amount">
                          {item.discountAmount !== 0
                            ? formatInvoiceAmount(item.discountAmount)
                            : "-"}
                        </td>
                        <td className="td-payment">{formatInvoiceAmount(item.payment)}</td>
                      </tr>
                    ))}

                    {Array.from({ length: page.emptyRowsCount }).map((_, i) => {
                      const rowNumber = page.startIndex + page.items.length + i + 1;
                      return (
                        <tr key={`empty-${rowNumber}`} className="empty-row">
                          <td className="td-stt">{rowNumber}</td>
                          <td className="td-name" />
                          <td className="td-unit" />
                          <td className="td-qty" />
                          <td className="td-price" />
                          <td className="td-subtotal">-</td>
                          <td className="td-ck" />
                          <td className="td-ck-amount">-</td>
                          <td className="td-payment">-</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="thu-ba-total-row">
                      <td colSpan={5} className="td-total-label">
                        {page.isLastPage
                          ? "Tổng Cộng"
                          : `Cộng chuyển trang sau (Trang ${page.pageNumber}/${page.totalPages})`}
                      </td>
                      <td className="td-subtotal td-total-subtotal">
                        {page.pageSubtotal !== 0n ? formatInvoiceAmount(page.pageSubtotal) : "-"}
                      </td>
                      <td className="td-ck-white" />
                      <td className="td-ck-amount td-total-ck">
                        {page.pageDiscount !== 0n ? formatInvoiceAmount(page.pageDiscount) : "-"}
                      </td>
                      <td className="td-payment td-total-payment">
                        {page.pagePayment !== 0n ? formatInvoiceAmount(page.pagePayment) : "-"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
