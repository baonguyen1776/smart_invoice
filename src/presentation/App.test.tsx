import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../application/shared/Result";
import type { ProductManagementActions } from "./screens/ProductManagementScreen";
import { App } from "./App";

describe("App", () => {
  it("opens the Product Management capability", async () => {
    const actions: ProductManagementActions = {
      listProducts: { execute: vi.fn(async () => ok([])) },
      createProduct: { execute: vi.fn() },
      updateProduct: { execute: vi.fn() },
      deactivateProduct: { execute: vi.fn() },
    };
    render(<App productActions={actions} />);
    expect(await screen.findByRole("heading", { name: "Quản lý sản phẩm" })).toBeVisible();
    expect(await screen.findByText("Chưa có sản phẩm")).toBeVisible();
  });
});
