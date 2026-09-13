import { useCallback, useEffect, useMemo, useState } from "react";
import type { Invoice } from "../../domain/entities/Invoice";
import { sumInvoiceAmounts } from "../../domain/rules/CalculateInvoiceAmounts";
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
  readonly onNewDraft?: () => void;
}

const MINIMUM_DISPLAY_ROWS = 14;

export function InvoiceReceiptPreviewModal({
  invoice,
  customer,
  isOpen,
  onClose,
  onPrint,
  onNewDraft,
}: InvoiceReceiptPreviewModalProps) {
  const [displayRowCount, setDisplayRowCount] = useState<number>(MINIMUM_DISPLAY_ROWS);

  const totals = useMemo(() => {
    if (!invoice || invoice.items.length === 0) {
      return { subtotal: 0, discountAmount: 0, payment: 0 };
    }
    return sumInvoiceAmounts(invoice.items);
  }, [invoice]);

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  }, [onPrint]);

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

  if (!isOpen || !invoice) {
    return null;
  }

  const items = invoice.items;
  const emptyRowsCount = Math.max(0, displayRowCount - items.length);
  const isCompact = items.length > 14;

  const customerAddress = customer?.address || (customer?.phone ? `SĐT: ${customer.phone}` : "");

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
          </div>
          <div className="receipt-toolbar-actions">
            <div className="receipt-toolbar-row-control">
              <label htmlFor="receipt-row-select">Số dòng:</label>
              <select
                id="receipt-row-select"
                value={displayRowCount}
                onChange={(e) => setDisplayRowCount(Number(e.target.value))}
                className="receipt-row-select"
              >
                <option value={14}>14 dòng (Chuẩn A5)</option>
                <option value={12}>12 dòng</option>
                <option value={10}>10 dòng</option>
                <option value={items.length}>Chỉ sản phẩm ({items.length})</option>
              </select>
            </div>
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

        <div className="receipt-paper-scroll">
          <div
            className={`thu-ba-invoice-paper ${isCompact ? "compact-mode" : ""}`}
            id="thu-ba-invoice-print-area"
          >
            <div className="thu-ba-header">
              <h2 className="store-name">THU BA</h2>
              <p className="store-address">
                Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp
              </p>
              <p className="store-phone">SĐT : 0989,601,556 - 0984,831,636</p>
              <h1 className="invoice-title">HÓA ĐƠN</h1>
            </div>

            <div className="customer-info-section">
              <div className="customer-row">
                <span className="customer-row-label">Khách hàng:</span>
                <span className="customer-row-val">{customer?.name || ""}</span>
              </div>
              <div className="customer-row">
                <span className="customer-row-label">Địa chỉ:</span>
                <span className="customer-row-val">{customerAddress}</span>
              </div>
            </div>

            <table className="thu-ba-table">
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
                {items.map((item, index) => (
                  <tr key={item.id} className="item-row">
                    <td className="td-stt">{index + 1}</td>
                    <td className="td-name">
                      <span className="item-product-name">{item.productName}</span>
                      {item.note && <span className="item-line-note">(Ghi chú: {item.note})</span>}
                    </td>
                    <td className="td-unit">{item.unitName}</td>
                    <td className="td-qty">{item.quantity}</td>
                    <td className="td-price">{item.unitPrice.toLocaleString("vi-VN")}</td>
                    <td className="td-subtotal">{item.subtotal.toLocaleString("vi-VN")}</td>
                    <td className="td-ck">
                      {item.discountBasisPoints > 0 ? `${item.discountBasisPoints / 100}%` : "-"}
                    </td>
                    <td className="td-ck-amount">
                      {item.discountAmount > 0 ? item.discountAmount.toLocaleString("vi-VN") : "-"}
                    </td>
                    <td className="td-payment">{item.payment.toLocaleString("vi-VN")}</td>
                  </tr>
                ))}

                {Array.from({ length: emptyRowsCount }).map((_, i) => {
                  const rowNumber = items.length + i + 1;
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
                    Tổng Cộng
                  </td>
                  <td className="td-subtotal td-total-subtotal">
                    {totals.subtotal > 0 ? totals.subtotal.toLocaleString("vi-VN") : "-"}
                  </td>
                  <td className="td-ck-white" />
                  <td className="td-ck-amount td-total-ck">
                    {totals.discountAmount > 0
                      ? totals.discountAmount.toLocaleString("vi-VN")
                      : "-"}
                  </td>
                  <td className="td-payment td-total-payment">
                    {totals.payment > 0 ? totals.payment.toLocaleString("vi-VN") : "-"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
