import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../application/shared/Result";
import { Invoice } from "../domain/entities/Invoice";
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
});
