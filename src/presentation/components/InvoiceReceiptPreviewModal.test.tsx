import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getAllByRole("row")).toHaveLength(4);

    // Total row
    expect(screen.getByText("Tổng Cộng")).toBeDefined();

    // Proportional colgroup with 9 columns
    const colgroup = document.querySelector(".thu-ba-table colgroup");
    expect(colgroup).not.toBeNull();
    const cols = colgroup?.querySelectorAll("col");
    expect(cols?.length).toBe(9);
  });

  it("adds blank display rows below items without changing amounts", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);

    render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />);

    // No manual dropdown
    expect(screen.queryByLabelText("Số dòng:")).toBeNull();

    const blanks = document.querySelectorAll(".receipt-empty-row");
    expect(blanks).toHaveLength(13);
    for (const row of blanks) {
      expect(row.children).toHaveLength(9);
      expect(row.textContent).toBe("");
    }
    expect(invoice.items).toHaveLength(1);
    expect(invoice.total).toBe(5000);
    expect(document.querySelector("tbody")?.lastElementChild).toBe(blanks[12]);
    expect(document.querySelector(".td-total-payment")).toHaveTextContent("5.000");
    // Decorative rows are hidden from the accessibility tree.
    // Table header, one item, and the total.
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(3);
  });

  it("toggles store branding without enlarging the remaining blocks", () => {
    const item = makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Bút bi", "Cây", 1, 5000);
    const invoice = makeSampleInvoice([item]);

    const { baseElement: container } = render(
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

    // Store branding lines omitted from the visible paper.
    expect(screen.queryByRole("heading", { name: "THU BA" })).toBeNull();
    expect(
      screen.getByText("Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp"),
    ).not.toBeVisible();
    expect(screen.getByText("SĐT : 0989,601,556 - 0984,831,636")).not.toBeVisible();

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

  it("allows forcing the shop header after the automatic layout saves a sheet", () => {
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

    const { baseElement: container } = render(
      <InvoiceReceiptPreviewModal invoice={invoice} isOpen={true} onClose={vi.fn()} />,
    );

    expect(container.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(1);
    const select = screen.getByLabelText("In tin cửa hàng:");
    expect(select).toHaveValue("none");
    fireEvent.change(select, { target: { value: "full" } });
    const papers = container.querySelectorAll(".thu-ba-invoice-paper");
    expect(papers.length).toBe(2);
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeVisible();
    expect(papers[0].querySelectorAll(".item-row")).toHaveLength(14);
    expect(papers[1].querySelectorAll(".item-row")).toHaveLength(2);
    expect(papers[0].classList.contains("compact-mode")).toBe(false);
    expect(screen.getByText("Tổng Cộng")).toBeDefined();
    expect(screen.getByText(/Hóa đơn 2 trang/)).toBeDefined();
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

    const { baseElement: container } = render(
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
    expect(screen.queryByText(/Cộng chuyển trang sau/)).toBeNull();
    // Page 2 header & final total
    expect(screen.queryByText("HÓA ĐƠN (Tiếp theo)")).toBeNull();
    expect(papers[1].querySelector(".thu-ba-header, .customer-info-section, thead")).toBeNull();
    expect(screen.getByText("Tổng Cộng")).toBeDefined();

    // Page 2 contains only its six actual rows, with no repeated headings or filler.
    const page2 = papers[1];
    const page2ItemRows = page2.querySelectorAll("tbody tr.item-row");
    expect(page2ItemRows.length).toBe(6);
    const page2EmptyRows = page2.querySelectorAll("tbody tr.empty-row");
    expect(page2EmptyRows.length).toBe(0);
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

describe("Print result confirmation", () => {
  function receipt() {
    return makeSampleInvoice([makeItem(ITEM_ID_1, PROD_ID_1, UNIT_ID_1, "Coffee", "Can", 1, 5000)]);
  }

  it("does not record a cancelled print and confirms only after an explicit success action", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const confirm = vi.fn(async () => null);
    render(
      <InvoiceReceiptPreviewModal
        invoice={receipt()}
        isOpen
        onClose={vi.fn()}
        onConfirmPrinted={confirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /In hóa đơn/ }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đã hủy / Chưa in" }));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /In hóa đơn/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đã in thành công" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    print.mockRestore();
  });

  it("does not offer success confirmation if opening the print dialog fails", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("unavailable");
    });
    const confirm = vi.fn(async () => null);
    render(
      <InvoiceReceiptPreviewModal
        invoice={receipt()}
        isOpen
        onClose={vi.fn()}
        onConfirmPrinted={confirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /In hóa đơn/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể mở hộp thoại in");
    expect(screen.queryByRole("button", { name: "Đã in thành công" })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it("allows retrying a failed status write without printing a duplicate receipt", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const confirm = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("Chưa lưu được trạng thái.")
      .mockResolvedValueOnce(null);
    render(
      <InvoiceReceiptPreviewModal
        invoice={receipt()}
        isOpen
        onClose={vi.fn()}
        onConfirmPrinted={confirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /In hóa đơn/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đã in thành công" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Đã in thành công" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Xác nhận kết quả in" })).toBeNull(),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});

describe("old-debt receipt layout", () => {
  function invoiceWithRows(count: number, debt: number) {
    return makeSampleInvoice(
      Array.from({ length: count }, (_, index) =>
        makeItem(
          crypto.randomUUID(),
          PROD_ID_1,
          UNIT_ID_1,
          `Hàng ${index + 1}`,
          "Cái",
          1,
          10000,
          1000,
        ),
      ),
    ).withOldDebt(debt, NOW);
  }
  it.each([9, 14])(
    "prints %i items with debt on one sheet, adding only blanks that fit",
    (count) => {
      render(
        <InvoiceReceiptPreviewModal
          invoice={invoiceWithRows(count, 50000)}
          isOpen
          onClose={vi.fn()}
        />,
      );
      const paper = document.querySelector(".thu-ba-invoice-paper")!;
      expect(document.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(1);
      expect(paper.querySelectorAll(".item-row")).toHaveLength(count);
      expect(paper.querySelectorAll(".receipt-empty-row")).toHaveLength(count === 9 ? 3 : 0);
      expect(screen.queryByRole("heading", { name: "THU BA" }) !== null).toBe(count === 9);
      expect(screen.getByRole("heading", { name: "HÓA ĐƠN" })).toBeVisible();
      const footer = paper.querySelector("tfoot")!;
      expect(Array.from(footer.rows, (row) => row.textContent)).toEqual([
        expect.stringContaining("Tổng Cộng"),
        expect.stringContaining("Cũ"),
        expect.stringContaining("Tổng cộng"),
      ]);
      expect(footer.querySelector(".receipt-old-debt-row .td-payment")).toHaveTextContent("50.000");
      expect(footer.querySelector(".receipt-final-total-row .td-payment")).toHaveTextContent(
        (count * 9000 + 50000).toLocaleString("vi-VN"),
      );
    },
  );
  it("prints the totals and debt block only after the last item on continuation sheets", () => {
    render(
      <InvoiceReceiptPreviewModal invoice={invoiceWithRows(45, 50000)} isOpen onClose={vi.fn()} />,
    );
    const papers = document.querySelectorAll(".thu-ba-invoice-paper");
    expect(papers.length).toBeGreaterThan(1);
    papers.forEach((paper, index) => {
      expect(paper.querySelectorAll("thead")).toHaveLength(index === 0 ? 1 : 0);
      if (index > 0)
        expect(paper.querySelector(".thu-ba-header, .customer-info-section")).toBeNull();
      expect(Boolean(paper.querySelector("tfoot"))).toBe(index === papers.length - 1);
    });
    expect(document.querySelectorAll(".item-row")).toHaveLength(45);
    expect(screen.getAllByText("Cũ")).toHaveLength(1);
  });
  it("retains the shop by default when cutting it still needs the same two sheets", () => {
    render(
      <InvoiceReceiptPreviewModal invoice={invoiceWithRows(16, 50000)} isOpen onClose={vi.fn()} />,
    );
    const select = screen.getByLabelText("In tin cửa hàng:");
    expect(select).toHaveValue("full");
    expect(Array.from((select as HTMLSelectElement).options, (option) => option.text)).toEqual([
      "In",
      "Không in",
    ]);
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeVisible();
    expect(document.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(2);
    fireEvent.change(select, { target: { value: "none" } });
    expect(screen.queryByRole("heading", { name: "THU BA" })).toBeNull();
    expect(document.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(2);
  });
  it("honors In and Không in after automatically fitting 14 items and debt on one sheet", () => {
    render(
      <InvoiceReceiptPreviewModal invoice={invoiceWithRows(14, 50000)} isOpen onClose={vi.fn()} />,
    );
    const select = screen.getByLabelText("In tin cửa hàng:");
    expect(select).toHaveValue("none");
    fireEvent.change(select, { target: { value: "full" } });
    expect(select).toHaveValue("full");
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeVisible();
    expect(document.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(2);
    fireEvent.change(select, { target: { value: "none" } });
    expect(screen.queryByRole("heading", { name: "THU BA" })).toBeNull();
    expect(document.querySelectorAll(".thu-ba-invoice-paper")).toHaveLength(1);
  });
  it("restores the default header and removes the extra rows when debt is cleared", () => {
    const invoice = invoiceWithRows(14, 50000);
    const view = render(<InvoiceReceiptPreviewModal invoice={invoice} isOpen onClose={vi.fn()} />);
    view.rerender(
      <InvoiceReceiptPreviewModal invoice={invoice.withOldDebt(0, NOW)} isOpen onClose={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "THU BA" })).toBeVisible();
    expect(screen.queryByText("Cũ")).toBeNull();
    expect(screen.queryByText("Tổng cộng")).toBeNull();
    expect(screen.getByText("Tổng Cộng")).toBeVisible();
  });
});
