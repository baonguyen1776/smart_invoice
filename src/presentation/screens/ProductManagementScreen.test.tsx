import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../application/shared/Result";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { ProductManagementScreen, type ProductManagementActions } from "./ProductManagementScreen";

const NOW = "2026-09-09T00:00:00.000Z";
const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const UNIT_ID = "20000000-0000-4000-8000-000000000001";

function makeProduct() {
  return Product.create({
    id: PRODUCT_ID,
    name: "Cà phê rang xay",
    sku: "CF-01",
    brand: "An Nhiên",
    category: "Đồ uống",
    createdAt: NOW,
    units: [
      Unit.create({
        id: UNIT_ID,
        productId: PRODUCT_ID,
        name: "Gói",
        price: 85000,
        createdAt: NOW,
      }),
    ],
  });
}

function makeActions(products: readonly Product[] = []): ProductManagementActions {
  return {
    listProducts: { execute: vi.fn(async () => ok(products)) },
    createProduct: { execute: vi.fn(async () => ok(makeProduct())) },
    updateProduct: { execute: vi.fn(async () => ok(makeProduct())) },
    deactivateProduct: { execute: vi.fn(async () => ok(makeProduct().deactivate(NOW))) },
  };
}

describe("ProductManagementScreen", () => {
  it("renders Product disambiguators and active Unit prices", async () => {
    render(<ProductManagementScreen actions={makeActions([makeProduct()])} />);
    expect(await screen.findByText("CF-01")).toBeVisible();
    expect(screen.getAllByText("An Nhiên").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đồ uống").length).toBeGreaterThan(0);
    expect(screen.getByText(/85.000/)).toBeVisible();
  });

  it("renders compact catalog stats badges in table header", async () => {
    render(<ProductManagementScreen actions={makeActions([makeProduct()])} />);
    const stats = await screen.findByLabelText("Thống kê danh mục");
    expect(within(stats).getAllByText("1")).toHaveLength(3);
    expect(within(stats).getByText(/sản phẩm/)).toBeVisible();
    expect(within(stats).getByText(/ĐVT/)).toBeVisible();
    expect(within(stats).getByText(/nhóm/)).toBeVisible();
  });

  it("submits a new Product through the Application action", async () => {
    const actions = makeActions();
    const create = vi.mocked(actions.createProduct.execute);
    render(<ProductManagementScreen actions={actions} />);
    await screen.findByText("Chưa có sản phẩm");
    fireEvent.click(screen.getAllByRole("button", { name: /Thêm sản phẩm/ })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Tên sản phẩm/), {
      target: { value: "Nước suối" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Mã sản phẩm/), {
      target: { value: "NS-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tên đơn vị"), { target: { value: "Chai" } });
    fireEvent.change(within(dialog).getByLabelText("Giá bán đơn vị 1"), {
      target: { value: "12000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu sản phẩm" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Nước suối",
        sku: "NS-01",
        brand: null,
        category: null,
        units: [{ name: "Chai", price: 12000 }],
      }),
    );
  });

  it("prevents removing the last active Unit and maps SKU conflicts", async () => {
    const actions = makeActions([makeProduct()]);
    actions.updateProduct.execute = vi.fn(async () =>
      err({ code: "sku_conflict" as const, sku: "CF-01" }),
    );
    render(<ProductManagementScreen actions={actions} />);
    await screen.findByText("CF-01");
    fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa Cà phê rang xay" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa đơn vị 1" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ít nhất một đơn vị");
    fireEvent.click(screen.getByRole("button", { name: "Lưu sản phẩm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã sản phẩm “CF-01” đã được sử dụng",
    );
  });

  it("requires confirmation before soft-deactivation", async () => {
    const actions = makeActions([makeProduct()]);
    const deactivate = vi.mocked(actions.deactivateProduct.execute);
    render(<ProductManagementScreen actions={actions} />);
    await screen.findByText("CF-01");
    fireEvent.click(screen.getByRole("button", { name: "Ngừng bán Cà phê rang xay" }));
    const dialog = screen.getByRole("alertdialog", { name: "Ngừng bán sản phẩm?" });
    expect(deactivate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ngừng bán Cà phê rang xay" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận ngừng bán" }));
    await waitFor(() => expect(deactivate).toHaveBeenCalledWith({ productId: PRODUCT_ID }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and shows a native deactivation failure", async () => {
    const actions = makeActions([makeProduct()]);
    actions.deactivateProduct.execute = vi.fn(async () =>
      err({ code: "persistence" as const, operation: "deactivate" as const, message: "hidden" }),
    );
    render(<ProductManagementScreen actions={actions} />);
    await screen.findByText("CF-01");

    fireEvent.click(screen.getByRole("button", { name: "Ngừng bán Cà phê rang xay" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận ngừng bán" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể lưu dữ liệu");
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
});
