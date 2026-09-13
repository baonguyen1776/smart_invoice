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

    // Customer info: Clean, no dotted lines
    expect(screen.getByText("Nguyễn Phương Gia Bảo")).toBeDefined();
    expect(screen.getByText("299 Đường 3/2, Chợ Gạo, Đồng Tháp")).toBeDefined();
    expect(document.querySelector(".customer-row-line")).toBeNull();

    // Print paper area: No invoice number or date
    const printArea = document.getElementById("thu-ba-invoice-print-area");
    expect(printArea?.textContent).not.toContain("Số HĐ:");
    expect(printArea?.textContent).not.toContain("Ngày:");

    // Toolbar (no-print) still shows invoice number for screen reference
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

    // Default 14 rows padded
    const rows = screen.getAllByRole("row");
    // header row (1) + 2 items + 12 empty rows + 1 footer row = 16 rows
    expect(rows.length).toBeGreaterThanOrEqual(15);

    // Total row
    expect(screen.getByText("Tổng Cộng")).toBeDefined();

    // Proportional colgroup with 9 columns
    const colgroup = document.querySelector(".thu-ba-table colgroup");
    expect(colgroup).not.toBeNull();
    const cols = colgroup?.querySelectorAll("col");
    expect(cols?.length).toBe(9);
  });

  it("automatically fills table up to standard 14 rows without manual row controls", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);

    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />);

    // No manual dropdown
    expect(screen.queryByLabelText("Số dòng:")).toBeNull();

    // 1 header + 1 item + 13 empty rows + 1 footer = 16 rows automatically
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(16);
  });

  it("toggles store branding header via dropdown and applies scaled layout", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);

    const { container } = render(
      <InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />,
    );

    const storeSelect = screen.getByLabelText("In tin cửa hàng:");
    expect(storeSelect).toHaveValue("full");
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeDefined();
    expect(
      screen.getByText("Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp"),
    ).toBeDefined();
    expect(screen.getByText("SĐT : 0989,601,556 - 0984,831,636")).toBeDefined();
    expect(screen.getByRole("heading", { name: "HÓA ĐƠN" })).toBeDefined();

    const paper = container.querySelector(".thu-ba-invoice-paper");
    expect(paper?.classList.contains("no-store-header")).toBe(false);

    // Switch to "Không in tên cửa hàng"
    fireEvent.change(storeSelect, { target: { value: "none" } });
    expect(storeSelect).toHaveValue("none");

    // Store branding lines omitted
    expect(screen.queryByRole("heading", { name: "THU BA" })).toBeNull();
    expect(
      screen.queryByText("Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp"),
    ).toBeNull();
    expect(screen.queryByText("SĐT : 0989,601,556 - 0984,831,636")).toBeNull();

    // Title still present
    expect(screen.getByRole("heading", { name: "HÓA ĐƠN" })).toBeDefined();

    // Paper has scaled layout class
    expect(paper?.classList.contains("no-store-header")).toBe(true);

    // Switch back to "In đầy đủ thông tin cửa hàng"
    fireEvent.change(storeSelect, { target: { value: "full" } });
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeDefined();
    expect(paper?.classList.contains("no-store-header")).toBe(false);
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

  it("renders large monetary amounts in tens of millions correctly", () => {
    const item = makeItem(
      ITEM_ID_1,
      PROD_ID_1,
      UNIT_ID_1,
      "Máy in công nghiệp",
      "Thùng",
      3,
      25000000,
      1000, // 10%
    );
    const invoice = makeSampleInvoice([item]);

    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Thùng")).toBeDefined();
    expect(screen.getByText("25.000.000")).toBeDefined();
    expect(screen.getAllByText("75.000.000").length).toBe(2);
    expect(screen.getAllByText("7.500.000").length).toBe(2);
    expect(screen.getAllByText("67.500.000").length).toBe(2);
  });

  it("activates compact-mode styling on single page when invoice has 15-16 items", () => {
    const items = Array.from({ length: 16 }, (_, i) => {
      const hex = String(i + 1).padStart(12, "0");
      return makeItem(
        `77777777-7777-4777-8777-${hex}`,
        `88888888-8888-4888-8888-${hex}`,
        `99999999-9999-4999-8999-${hex}`,
        `Mặt hàng ${i + 1}`,
        "Cái",
        1,
        10000 * (i + 1),
      );
    });
    const invoice = makeSampleInvoice(items);

    const { container } = render(
      <InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />,
    );

    const papers = container.querySelectorAll(".thu-ba-invoice-paper");
    expect(papers.length).toBe(1);
    expect(papers[0].classList.contains("compact-mode")).toBe(true);
    expect(screen.getByText("Tổng Cộng")).toBeDefined();
    expect(screen.queryByText(/Hóa đơn \d+ trang/)).toBeNull();
  });

  it("automatically paginates into multiple A5 sheets when invoice exceeds 16 items", () => {
    const items = Array.from({ length: 20 }, (_, i) => {
      const hex = String(i + 1).padStart(12, "0");
      return makeItem(
        `77777777-7777-4777-8777-${hex}`,
        `88888888-8888-4888-8888-${hex}`,
        `99999999-9999-4999-8999-${hex}`,
        `Sản phẩm số ${i + 1}`,
        "Thùng",
        2,
        50000,
      );
    });
    const invoice = makeSampleInvoice(items);

    const { container } = render(
      <InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />,
    );

    // Multi-page badge in toolbar
    expect(screen.getByText("Hóa đơn 2 trang (Tự động chia trang)")).toBeDefined();

    // 2 paper sheets rendered
    const papers = container.querySelectorAll(".thu-ba-invoice-paper");
    expect(papers.length).toBe(2);

    // Neither uses compact-mode since each page has standard 14 rows
    expect(papers[0].classList.contains("compact-mode")).toBe(false);
    expect(papers[1].classList.contains("compact-mode")).toBe(false);

    // Page 1 header & running total
    expect(screen.getByText("Cộng chuyển trang sau (Trang 1/2)")).toBeDefined();
    // Page 2 header & final total
    expect(screen.getByText("HÓA ĐƠN (Tiếp theo)")).toBeDefined();
    expect(screen.getByText("Trang 2/2")).toBeDefined();
    expect(screen.getByText("Tổng Cộng")).toBeDefined();

    // Verify row counts on Page 2: 6 items (index 15..20) + 8 empty rows
    const page2 = papers[1];
    const page2ItemRows = page2.querySelectorAll("tbody tr.item-row");
    expect(page2ItemRows.length).toBe(6);
    const page2EmptyRows = page2.querySelectorAll("tbody tr.empty-row");
    expect(page2EmptyRows.length).toBe(8);
  });

  it("formats negative subtotal and payment with parentheses in total footer", () => {
    const returnItem = makeItem(
      ITEM_ID_1,
      PROD_ID_1,
      UNIT_ID_1,
      "Hàng trả lại - Xi măng",
      "Bao",
      -2,
      90000,
    );
    const invoice = makeSampleInvoice([returnItem]);
    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getAllByText("(180.000)").length).toBeGreaterThanOrEqual(1);
  });
});
