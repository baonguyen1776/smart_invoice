import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../application/shared/Result";
import { Invoice } from "../domain/entities/Invoice";
import { InvoiceItem } from "../domain/entities/InvoiceItem";
import type { InvoiceScreenActions } from "./screens/CreateInvoiceScreen";
import type { ProductManagementActions } from "./screens/ProductManagementScreen";
import { App } from "./App";

const NOW = "2026-09-10T01:00:00.000Z";
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

function makeDraft(): Invoice {
  return Invoice.rehydrate({
    id: INVOICE_ID,
    invoiceNumber: 1,
    status: "draft",
    total: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    items: [],
  });
}

describe("App", () => {
  it("opens Product Management capability when invoiceActions is not provided", async () => {
    const productActions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    render(<App productActions={productActions} />);
    expect(await screen.findByRole("heading", { name: "Quản lý sản phẩm" })).toBeVisible();
    expect(await screen.findByText("Chưa có sản phẩm")).toBeVisible();
  });

  it("opens Create Invoice capability by default and supports sidebar navigation", async () => {
    const productActions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    const invoiceActions: InvoiceScreenActions = {
      createInvoiceDraft: { execute: vi.fn(async () => ok(makeDraft())) },
      applyInvoiceItemChange: { execute: vi.fn() },
      searchProducts: { execute: vi.fn(() => ok([])) },
    };

    render(<App productActions={productActions} invoiceActions={invoiceActions} />);

    // Renders Create Invoice screen by default
    expect(await screen.findByRole("heading", { name: "Tạo hóa đơn mới" })).toBeVisible();

    // Click "Sản phẩm" in sidebar
    const productsNavButton = within(screen.getByRole("navigation")).getByRole("button", {
      name: /Sản phẩm/,
    });
    fireEvent.click(productsNavButton);

    // Switches to Product Management screen
    expect(await screen.findByRole("heading", { name: "Quản lý sản phẩm" })).toBeVisible();

    // Click "Tạo hóa đơn" in sidebar
    const invoiceNavButton = screen.getByRole("button", { name: /Tạo hóa đơn/ });
    fireEvent.click(invoiceNavButton);

    // Switches back to Create Invoice screen
    expect(await screen.findByRole("heading", { name: "Tạo hóa đơn mới" })).toBeVisible();
  });

  it("preserves invoice form state across screen navigation within the app", async () => {
    const productActions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    const invoiceActions: InvoiceScreenActions = {
      createInvoiceDraft: { execute: vi.fn(async () => ok(makeDraft())) },
      applyInvoiceItemChange: { execute: vi.fn() },
      searchProducts: { execute: vi.fn(() => ok([])) },
    };

    render(<App productActions={productActions} invoiceActions={invoiceActions} />);
    expect(await screen.findByRole("heading", { name: "Tạo hóa đơn mới" })).toBeVisible();

    // Type customer name
    const customerInput = screen.getByLabelText("Tên khách hàng");
    fireEvent.change(customerInput, { target: { value: "Khách VIP" } });
    expect(customerInput).toHaveValue("Khách VIP");

    // Navigate to Products screen
    const productsNavButton = within(screen.getByRole("navigation")).getByRole("button", {
      name: /Sản phẩm/,
    });
    fireEvent.click(productsNavButton);
    expect(await screen.findByRole("heading", { name: "Quản lý sản phẩm" })).toBeVisible();

    // Navigate back to Invoice screen
    const invoiceNavButton = screen.getByRole("button", { name: /Tạo hóa đơn/ });
    fireEvent.click(invoiceNavButton);
    expect(await screen.findByRole("heading", { name: "Tạo hóa đơn mới" })).toBeVisible();

    // Customer name and invoice screen state must be preserved
    expect(screen.getByLabelText("Tên khách hàng")).toHaveValue("Khách VIP");
    // createInvoiceDraft should NOT have been called a second time
    expect(invoiceActions.createInvoiceDraft.execute).toHaveBeenCalledTimes(1);
  });

  it("navigates to History screen via sidebar and displays invoice history", async () => {
    const productActions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    const completedInvoice = Invoice.rehydrate({
      id: "22222222-2222-4222-8222-222222222222",
      invoiceNumber: 88,
      status: "completed",
      total: 100000,
      customerName: "Khách Lịch Sử",
      customerPhone: "0912345678",
      customerAddress: null,
      customerNote: null,
      isPrinted: true,
      printedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: NOW,
      items: [
        InvoiceItem.rehydrate({
          id: "44444444-4444-4444-8444-444444444444",
          invoiceId: "22222222-2222-4222-8222-222222222222",
          productId: "55555555-5555-4555-8555-555555555555",
          unitId: "66666666-6666-4666-8666-666666666666",
          productName: "Cát xây tô",
          productSku: null,
          productBrand: null,
          unitName: "Khối",
          unitPrice: 100000,
          quantity: 1,
          subtotal: 100000,
          discountBasisPoints: 0,
          note: null,
          createdAt: NOW,
        }),
      ],
    });

    const invoiceActions: InvoiceScreenActions = {
      createInvoiceDraft: { execute: vi.fn(async () => ok(makeDraft())) },
      applyInvoiceItemChange: { execute: vi.fn() },
      searchProducts: { execute: vi.fn(() => ok([])) },
      listInvoices: { execute: vi.fn(async () => ok([completedInvoice])) },
    };

    render(<App productActions={productActions} invoiceActions={invoiceActions} />);

    // Click "Lịch sử" in sidebar
    const historyNavButton = within(screen.getByRole("navigation")).getByRole("button", {
      name: /Lịch sử/,
    });
    fireEvent.click(historyNavButton);

    // Displays History table and invoice item
    expect(await screen.findByPlaceholderText("Tìm kiếm hóa đơn theo mã số, tên khách hàng, SĐT...")).toBeVisible();
    expect(screen.getByText("#000088")).toBeVisible();
    expect(screen.getByText("Khách Lịch Sử")).toBeVisible();
    expect(screen.getByText("Đã in")).toBeVisible();
  });

  it("switches to Create Invoice screen when editing an invoice from History modal", async () => {
    const productActions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    const completedInvoice = Invoice.rehydrate({
      id: "33333333-3333-4333-8333-333333333333",
      invoiceNumber: 99,
      status: "completed",
      total: 100000,
      customerName: "Khách Chờ Sửa",
      customerPhone: "0999888777",
      customerAddress: null,
      customerNote: null,
      isPrinted: false,
      printedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: NOW,
      items: [
        InvoiceItem.rehydrate({
          id: "77777777-7777-4777-8777-777777777777",
          invoiceId: "33333333-3333-4333-8333-333333333333",
          productId: "88888888-8888-4888-8888-888888888888",
          unitId: "99999999-9999-4999-8999-999999999999",
          productName: "Cát xây tô",
          productSku: null,
          productBrand: null,
          unitName: "Khối",
          unitPrice: 100000,
          quantity: 1,
          subtotal: 100000,
          discountBasisPoints: 0,
          note: null,
          createdAt: NOW,
        }),
      ],
    });

    const invoiceActions: InvoiceScreenActions = {
      createInvoiceDraft: { execute: vi.fn(async () => ok(makeDraft())) },
      applyInvoiceItemChange: { execute: vi.fn() },
      searchProducts: { execute: vi.fn(() => ok([])) },
      listInvoices: { execute: vi.fn(async () => ok([completedInvoice])) },
    };

    render(<App productActions={productActions} invoiceActions={invoiceActions} />);

    // Go to History screen
    fireEvent.click(
      within(screen.getByRole("navigation")).getByRole("button", { name: /Lịch sử/ }),
    );

    // Click invoice row
    const row = await screen.findByText("#000099");
    fireEvent.click(row);

    // Click "Sửa hóa đơn" button in A5 preview modal
    const editBtn = await screen.findByRole("button", { name: /Sửa hóa đơn/ });
    fireEvent.click(editBtn);

    // Diagnostic log
    expect(await screen.findByDisplayValue("Khách Chờ Sửa")).toBeVisible();
    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: "Chi tiết hóa đơn",
        level: 1,
      }),
    ).toBeVisible();
  });
});
