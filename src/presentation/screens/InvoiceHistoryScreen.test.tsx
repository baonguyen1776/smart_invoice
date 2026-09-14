import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../../application/shared/Result";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InvoiceHistoryScreen, type InvoiceHistoryActions } from "./InvoiceHistoryScreen";

const NOW = "2026-09-13T10:30:00.000Z";
const YESTERDAY = "2026-09-12T08:15:00.000Z";

function makeInvoice(overrides: Partial<Parameters<typeof Invoice.rehydrate>[0]>): Invoice {
  const invoiceId = overrides.id ?? "11111111-1111-4111-8111-111111111111";
  const total = overrides.total !== undefined ? overrides.total : 150000;
  const items = overrides.items ?? [
    InvoiceItem.rehydrate({
      id: "99999999-9999-4999-8999-999999999999",
      invoiceId,
      productId: "33333333-3333-4333-8333-333333333333",
      unitId: "44444444-4444-4444-8444-444444444444",
      productName: "Cát xây tô",
      productSku: "CAT-01",
      productBrand: "Việt",
      unitName: "Khối",
      unitPrice: total,
      quantity: 1,
      subtotal: total,
      discountBasisPoints: 0,
      note: null,
      createdAt: NOW,
    }),
  ];

  return Invoice.rehydrate({
    id: invoiceId,
    invoiceNumber: 1,
    status: "completed",
    customerName: "Nguyễn Văn A",
    customerPhone: "0901234567",
    customerAddress: "123 Đường ABC",
    customerNote: "Giao buổi sáng",
    isPrinted: false,
    printedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    ...overrides,
    total,
    items,
  });
}

describe("InvoiceHistoryScreen", () => {
  it("renders 5 table columns and completed invoices with accurate data", async () => {
    const invoice1 = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
      total: 250000,
      customerName: "Trần Thị Mai",
      customerPhone: "0987654321",
      isPrinted: true,
      completedAt: NOW,
    });

    const invoice2 = makeInvoice({
      id: "22222222-2222-4222-8222-222222222222",
      invoiceNumber: 102,
      total: 500000,
      customerName: null,
      customerPhone: null,
      isPrinted: false,
      completedAt: YESTERDAY,
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice1, invoice2])) },
      markInvoicePrinted: { execute: vi.fn(async () => ok(undefined)) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);

    // Kiểm tra header table 5 cột
    expect(await screen.findByText("Mã hóa đơn")).toBeVisible();
    expect(screen.getByText("Ngày tạo")).toBeVisible();
    expect(screen.getByText("Tên khách hàng")).toBeVisible();
    expect(screen.getByText("Số tiền")).toBeVisible();
    expect(screen.getByText("Trạng thái in")).toBeVisible();

    // Hóa đơn 1: Đã in, có tên & SĐT
    expect(screen.getByText("#000101")).toBeVisible();
    expect(screen.getByText("Trần Thị Mai")).toBeVisible();
    expect(screen.getByText("0987654321")).toBeVisible();
    expect(screen.getByText("250.000 đ")).toBeVisible();
    expect(screen.getByText("Đã in")).toBeVisible();

    // Hóa đơn 2: Chưa in, khách lẻ
    expect(screen.getByText("#000102")).toBeVisible();
    expect(screen.getByText("(Khách lẻ)")).toBeVisible();
    expect(screen.getByText("500.000 đ")).toBeVisible();
    expect(screen.getByText("Chưa in")).toBeVisible();
  });

  it("formats negative amount in parentheses with is-negative class", async () => {
    const returnInvoice = {
      id: "33333333-3333-4333-8333-333333333333",
      invoiceNumber: 103,
      status: "completed",
      total: -50000,
      customerName: "Khách Đổi Trả",
      customerPhone: null,
      isPrinted: false,
      createdAt: NOW,
      completedAt: NOW,
      items: [],
    } as unknown as Invoice;

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([returnInvoice])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);

    const amountCell = await screen.findByText("(50.000 đ)");
    expect(amountCell).toBeVisible();
    expect(amountCell).toHaveClass("is-negative");
  });

  it("filters invoices by search query (invoice number, customer name, phone)", async () => {
    const invoice1 = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
      customerName: "Lê Văn Hùng",
      customerPhone: "0911222333",
    });

    const invoice2 = makeInvoice({
      id: "22222222-2222-4222-8222-222222222222",
      invoiceNumber: 202,
      customerName: "Phạm Thu Thảo",
      customerPhone: "0944555666",
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice1, invoice2])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);
    expect(await screen.findByText("#000101")).toBeVisible();
    expect(screen.getByText("#000202")).toBeVisible();

    const searchInput = screen.getByPlaceholderText(
      "Tìm kiếm hóa đơn theo mã số, tên khách hàng, SĐT...",
    );

    // Tìm theo tên có dấu
    fireEvent.change(searchInput, { target: { value: "thu thảo" } });
    expect(screen.queryByText("#000101")).toBeNull();
    expect(screen.getByText("#000202")).toBeVisible();

    // Tìm theo tên không dấu (Vietnamese accent-insensitive)
    fireEvent.change(searchInput, { target: { value: "thu thao" } });
    expect(screen.queryByText("#000101")).toBeNull();
    expect(screen.getByText("#000202")).toBeVisible();

    // Tìm theo số điện thoại
    fireEvent.change(searchInput, { target: { value: "0911222" } });
    expect(screen.getByText("#000101")).toBeVisible();
    expect(screen.queryByText("#000202")).toBeNull();

    // Tìm theo mã hóa đơn
    fireEvent.change(searchInput, { target: { value: "202" } });
    expect(screen.queryByText("#000101")).toBeNull();
    expect(screen.getByText("#000202")).toBeVisible();
  });

  it("clicking an invoice row opens the A5 receipt preview modal", async () => {
    const invoice = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
      customerName: "Bùi Tiến Dũng",
      customerPhone: "0977888999",
      customerAddress: "Xã Chợ Gạo, Tiền Giang",
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);

    // Click dòng hóa đơn
    const row = await screen.findByText("#000101");
    fireEvent.click(row);

    // Modal xem trước khổ A5 tiệm THU BA hiển thị
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Xem trước phiếu in hóa đơn" }),
    ).toBeVisible();
    expect(within(dialog).getByText("THU BA")).toBeVisible();
    expect(within(dialog).getByText("Bùi Tiến Dũng")).toBeVisible();
    expect(within(dialog).getByText("Xã Chợ Gạo, Tiền Giang")).toBeVisible();
    expect(within(dialog).getByText("Cát xây tô")).toBeVisible();
  });

  it("marks invoice as printed only after explicit success confirmation", async () => {
    const originalPrint = window.print;
    window.print = vi.fn();

    const invoice = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
      isPrinted: false,
    });

    const markPrintedMock = vi.fn(async () => ok(undefined));
    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice])) },
      markInvoicePrinted: { execute: markPrintedMock },
    };

    render(<InvoiceHistoryScreen actions={actions} />);

    // Ban đầu badge là "Chưa in"
    expect(await screen.findByText("Chưa in")).toBeVisible();

    // Click dòng hóa đơn để mở modal
    fireEvent.click(screen.getByText("#000101"));
    expect(
      await screen.findByRole("heading", { name: "Xem trước phiếu in hóa đơn" }),
    ).toBeVisible();

    // Bấm nút "In hóa đơn"
    const printButton = screen.getByRole("button", { name: /In hóa đơn/ });
    fireEvent.click(printButton);
    expect(window.print).toHaveBeenCalled();
    expect(markPrintedMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đã in thành công" }));

    await waitFor(() => {
      expect(markPrintedMock).toHaveBeenCalledWith({
        invoiceId: "11111111-1111-4111-8111-111111111111",
        printedAt: expect.any(String),
      });
      expect(window.print).toHaveBeenCalled();
    });

    // Sau khi in, badge trên danh sách tự động chuyển thành "Đã in"
    const closeBtn = screen.getByLabelText("Đóng cửa sổ xem trước");
    fireEvent.click(closeBtn);

    expect(await screen.findByText("Đã in")).toBeVisible();

    window.print = originalPrint;
  });

  it("calls onSelectInvoiceForEdit and navigates when Sửa hóa đơn is clicked in modal", async () => {
    const invoice = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice])) },
    };

    const handleSelectForEdit = vi.fn();
    const handleNavigate = vi.fn();

    render(
      <InvoiceHistoryScreen
        actions={actions}
        onSelectInvoiceForEdit={handleSelectForEdit}
        onNavigate={handleNavigate}
      />,
    );

    // Click dòng để mở preview
    fireEvent.click(await screen.findByText("#000101"));

    // Bấm nút "Sửa hóa đơn"
    const editBtn = await screen.findByRole("button", { name: /Sửa hóa đơn/ });
    fireEvent.click(editBtn);

    expect(handleSelectForEdit).toHaveBeenCalledWith(invoice);
    expect(handleNavigate).toHaveBeenCalledWith("invoice");
  });

  it("toggles calendar popover and filters by preset chips", async () => {
    const invoice = makeInvoice({
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: 101,
      completedAt: NOW,
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([invoice])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);
    expect(await screen.findByText("#000101")).toBeVisible();

    // Mở calendar popover
    const filterBtn = screen.getByLabelText("Lọc theo ngày");
    fireEvent.click(filterBtn);

    const popover = screen.getByRole("dialog", { name: "Bộ lọc ngày" });
    expect(popover).toBeVisible();

    // Bấm preset "Hôm nay"
    const todayChip = within(popover).getByRole("button", { name: "Hôm nay" });
    fireEvent.click(todayChip);

    // Popover đóng và nút lọc cập nhật nhãn
    expect(screen.queryByRole("dialog", { name: "Bộ lọc ngày" })).toBeNull();
    expect(screen.getByText("Hôm nay")).toBeVisible();
  });

  it("closes calendar popover on Escape key", async () => {
    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);
    const filterBtn = screen.getByLabelText("Lọc theo ngày");
    fireEvent.click(filterBtn);
    expect(screen.getByRole("dialog", { name: "Bộ lọc ngày" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Bộ lọc ngày" })).toBeNull();
  });

  it("displays empty state when list is empty", async () => {
    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);
    expect(await screen.findByText("Không tìm thấy hóa đơn nào")).toBeVisible();
    expect(
      screen.getByText("Chưa có hóa đơn bán hàng nào được hoàn thành trong hệ thống."),
    ).toBeVisible();
  });

  it("resolves legacy customer name and phone from localStorage when db values are null", async () => {
    const legacyInvoiceId = "33333333-3333-4333-8333-333333333333";
    localStorage.setItem(
      `smart_invoice_customer_${legacyInvoiceId}`,
      JSON.stringify({
        name: "Anh Tuấn",
        phone: "0912345678",
        note: "Khách quen",
      }),
    );

    const legacyInvoice = makeInvoice({
      id: legacyInvoiceId,
      invoiceNumber: 40,
      customerName: null,
      customerPhone: null,
      completedAt: NOW,
    });

    const actions: InvoiceHistoryActions = {
      listInvoices: { execute: vi.fn(async () => ok([legacyInvoice])) },
    };

    render(<InvoiceHistoryScreen actions={actions} />);

    expect(await screen.findByText("#000040")).toBeVisible();
    expect(screen.getByText("Anh Tuấn")).toBeVisible();
    expect(screen.getByText("0912345678")).toBeVisible();

    // Click row to open preview receipt modal and ensure customer name is passed
    fireEvent.click(screen.getByText("#000040"));
    expect(await screen.findByText("Xem trước phiếu in hóa đơn")).toBeVisible();
    const customerElements = screen.getAllByText("Anh Tuấn");
    expect(customerElements.length).toBeGreaterThanOrEqual(2);

    localStorage.removeItem(`smart_invoice_customer_${legacyInvoiceId}`);
  });
});
