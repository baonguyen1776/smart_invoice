import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InvoiceReceiptPreviewModal } from "./InvoiceReceiptPreviewModal";

const NOW = "2026-09-12T14:30:00.000Z";
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID_1 = "77777777-7777-4777-8777-777777777771";
const ITEM_ID_2 = "77777777-7777-4777-8777-777777777772";
const PROD_ID_1 = "88888888-8888-4888-8888-888888888881";
const PROD_ID_2 = "88888888-8888-4888-8888-888888888882";
const UNIT_ID_1 = "99999999-9999-4999-8999-999999999991";
const UNIT_ID_2 = "99999999-9999-4999-8999-999999999992";

function makeItem(
  id: string,
  productId: string,
  unitId: string,
  productName: string,
  unitName: string,
  quantity: number,
  unitPrice: number,
  discountBasisPoints = 0,
  note?: string,
): InvoiceItem {
  return InvoiceItem.create({
    id,
    invoiceId: INVOICE_ID,
    productId,
    unitId,
    productName,
    productSku: null,
    productBrand: null,
    unitName,
    unitPrice,
    quantity,
    discountBasisPoints,
    note,
    createdAt: NOW,
  });
}

function makeSampleInvoice(items: readonly InvoiceItem[]): Invoice {
  const total = items.reduce((sum, item) => sum + item.payment, 0);
  return Invoice.rehydrate({
    id: INVOICE_ID,
    invoiceNumber: 1,
    status: "completed",
    total,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    items,
  });
}

describe("InvoiceReceiptPreviewModal", () => {
  it("does not render when isOpen is false", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);
    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when invoice is null", () => {
    render(<InvoiceReceiptPreviewModal invoice={null} isOpen={true} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders THU BA store branding, header details, and customer information", () => {
    const item1 = makeItem(
      ITEM_ID_1,
      PROD_ID_1,
      UNIT_ID_1,
      "Tập học sinh 200 trang",
      "Cuốn",
      10,
      15000,
      0,
      "Đã giao trước 5 cuốn",
    );
    const item2 = makeItem(
      ITEM_ID_2,
      PROD_ID_2,
      UNIT_ID_2,
      "Bút bi Thiên Long",
      "Hộp",
      2,
      85000,
      500, // 5% discount
    );
    const invoice = makeSampleInvoice([item1, item2]);

    render(
      <InvoiceReceiptPreviewModal
        invoice={invoice}
        customer={{
          name: "Nguyễn Phương Gia Bảo",
          phone: "0989.601.556",
          address: "299 Đường 3/2, Chợ Gạo, Đồng Tháp",
        }}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    // Store branding
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeDefined();
    expect(
      screen.getByText("Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp"),
    ).toBeDefined();
    expect(screen.getByText("SĐT : 0989,601,556 - 0984,831,636")).toBeDefined();
    expect(screen.getByRole("heading", { name: "HÓA ĐƠN" })).toBeDefined();

    // Customer info
    expect(screen.getByText("Nguyễn Phương Gia Bảo")).toBeDefined();
    expect(screen.getByText("299 Đường 3/2, Chợ Gạo, Đồng Tháp")).toBeDefined();

    // Invoice Number
    expect(screen.getAllByText("#000001").length).toBeGreaterThanOrEqual(1);

    // Table Column Headers
    expect(screen.getByRole("columnheader", { name: "Stt" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Tên hàng hóa" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Đvt" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /Số.*lượng/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Đơn giá" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Thành tiền" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "CK" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Tiền CK" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Thanh toán" })).toBeDefined();

    // Line Items Content
    expect(screen.getByText("Tập học sinh 200 trang")).toBeDefined();
    expect(screen.getByText("(Ghi chú: Đã giao trước 5 cuốn)")).toBeDefined();
    expect(screen.getByText("Bút bi Thiên Long")).toBeDefined();
    expect(screen.getByText("5%")).toBeDefined();

    // Minimum 14 rows padded
    const rows = screen.getAllByRole("row");
    // header row (1) + 2 items + 12 empty rows + 1 footer row = 16 rows
    expect(rows.length).toBeGreaterThanOrEqual(15);

    // Total row
    expect(screen.getByText("Tổng Cộng")).toBeDefined();
  });

  it("handles print trigger via button click and Enter keyboard shortcut", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);
    const onPrint = vi.fn();

    render(
      <InvoiceReceiptPreviewModal
        invoice={invoice}
        isOpen={true}
        onClose={vi.fn()}
        onPrint={onPrint}
      />,
    );

    const printButton = screen.getByRole("button", { name: /In hóa đơn/i });
    fireEvent.click(printButton);
    expect(onPrint).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onPrint).toHaveBeenCalledTimes(2);
  });

  it("handles close & new draft via button click and Escape key", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);
    const onNewDraft = vi.fn();
    const onClose = vi.fn();

    render(
      <InvoiceReceiptPreviewModal
        invoice={invoice}
        isOpen={true}
        onClose={onClose}
        onNewDraft={onNewDraft}
      />,
    );

    const newDraftButton = screen.getByRole("button", { name: /Đóng & Tạo đơn mới/i });
    fireEvent.click(newDraftButton);
    expect(onNewDraft).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onNewDraft).toHaveBeenCalledTimes(2);
  });

  it("handles close button and backdrop click", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);
    const onClose = vi.fn();

    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByRole("button", { name: "Đóng cửa sổ xem trước" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen.getByTestId("receipt-modal-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
