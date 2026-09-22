import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../../application/shared/Result";
import type { ProductImportPreview } from "../../application/use-cases/PreviewProductSpreadsheetImport";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { ProductImportDialog } from "./ProductImportDialog";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-20T00:00:00.000Z";

describe("ProductImportDialog", () => {
  it("paginates large imports and preserves decisions while searching", async () => {
    const source = preview();
    const largePreview = {
      ...source,
      productCount: 31,
      sourceRowCount: 31,
      unitCount: 31,
      candidates: Array.from({ length: 31 }, (_, index) => ({
        ...source.candidates[0],
        key: `sku-${index}`,
        sku: `SKU-${index}`,
        name: `Hàng ${index}`,
        sourceRows: [index + 2],
        issues: [],
        matchKind: "new" as const,
        possibleMatches: [],
        requiresDecision: false,
        units: [
          {
            ...source.candidates[0].units[0],
            sourceRowNumber: index + 2,
            requiresPriceDecision: false,
            acceptedPrice: 4000,
          },
        ],
      })),
    };
    render(
      <ProductImportDialog
        actions={{
          previewProductImport: { execute: vi.fn().mockResolvedValue(ok(largePreview)) },
          applyProductImport: { execute: vi.fn() },
        }}
        onClose={() => undefined}
        onImported={() => undefined}
      />,
    );
    const file = new File(["xlsx"], "products.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    fireEvent.change(screen.getByLabelText("Chọn file .xlsx"), { target: { files: [file] } });
    await screen.findByText("Hàng 0");
    expect(screen.queryByText("Hàng 30")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getByText("Hàng 30")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quyết định cho Hàng 30"), {
      target: { value: "skip" },
    });
    fireEvent.change(screen.getByLabelText("Tìm trong file import"), {
      target: { value: "SKU-0" },
    });
    expect(screen.getByText("Hàng 0")).toBeInTheDocument();
    expect(screen.queryByText("Hàng 30")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tìm trong file import"), {
      target: { value: "SKU-30" },
    });
    expect(screen.getByLabelText("Quyết định cho Hàng 30")).toHaveValue("skip");
    expect(screen.getByRole("button", { name: "Nhập 30 sản phẩm" })).toBeEnabled();
  });

  it("does not preselect a product when multiple matches need review", async () => {
    const source = preview();
    const first = source.candidates[0].possibleMatches[0];
    const second = Product.create({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Bút bi khác",
      sku: "OTHER",
      brand: "Thiên Long",
      category: "Viết",
      createdAt: NOW,
      units: [
        Unit.create({
          id: "44444444-4444-4444-8444-444444444444",
          productId: "33333333-3333-4333-8333-333333333333",
          name: "Cây",
          price: 4000,
          createdAt: NOW,
        }),
      ],
    });
    const multiple = {
      ...source,
      candidates: [
        {
          ...source.candidates[0],
          possibleMatches: [first, { ...first, product: second, score: 85 }],
        },
      ],
    };
    render(
      <ProductImportDialog
        actions={{
          previewProductImport: { execute: vi.fn().mockResolvedValue(ok(multiple)) },
          applyProductImport: { execute: vi.fn() },
        }}
        onClose={() => undefined}
        onImported={() => undefined}
      />,
    );
    const file = new File(["xlsx"], "products.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    fireEvent.change(screen.getByLabelText("Chọn file .xlsx"), { target: { files: [file] } });
    await screen.findByText("Bút bi TL027");
    fireEvent.change(screen.getByLabelText("Quyết định cho Bút bi TL027"), {
      target: { value: "update" },
    });
    expect(screen.getByLabelText("Sản phẩm đích cho Bút bi TL027")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Nhập 1 sản phẩm" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sản phẩm đích cho Bút bi TL027"), {
      target: { value: second.id },
    });
    expect(screen.getByTitle(/giữ giá DB 4\.000/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập 1 sản phẩm" })).toBeEnabled();
  });
  it("supports manual VND price correction independently from the matching decision", async () => {
    const previewProductImport = { execute: vi.fn().mockResolvedValue(ok(preview())) };
    const applyProductImport = {
      execute: vi
        .fn()
        .mockResolvedValue(
          ok({ created: 0, updated: 1, skipped: 0, unitsCreated: 0, aliasesCreated: 1 }),
        ),
    };
    const onImported = vi.fn();
    render(
      <ProductImportDialog
        actions={{ previewProductImport, applyProductImport }}
        onClose={() => undefined}
        onImported={onImported}
      />,
    );

    const file = new File(["xlsx"], "products.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    fireEvent.change(screen.getByLabelText("Chọn file .xlsx"), { target: { files: [file] } });

    expect(await screen.findByText("Bút bi TL027")).toBeInTheDocument();
    expect(screen.getByText(/90\/100/)).toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: "Nhập 1 sản phẩm" });
    expect(importButton).toBeDisabled();
    expect(screen.queryByLabelText("Giá nhập cho Bút bi TL027 - Cây")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Giá cần xử lý")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText("7.083,33 ₫"));
    const priceInput = screen.getByLabelText("Giá nhập cho Bút bi TL027 - Cây");
    expect(priceInput).toHaveValue("7.083,33");
    fireEvent.change(priceInput, { target: { value: "7.100,5" } });
    expect(screen.getByLabelText("Giá cần xử lý")).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    fireEvent.blur(priceInput);
    expect(screen.getByText("7.083,33 ₫")).toBeInTheDocument();
    expect(screen.getByLabelText("Giá cần xử lý")).toBeInTheDocument();
    expect(importButton).toBeDisabled();

    fireEvent.doubleClick(screen.getByText("7.083,33 ₫"));
    const correctedPriceInput = screen.getByLabelText("Giá nhập cho Bút bi TL027 - Cây");
    fireEvent.change(correctedPriceInput, { target: { value: "7100" } });
    expect(correctedPriceInput).toHaveValue("7.100");
    expect(screen.queryByLabelText("Giá cần xử lý")).not.toBeInTheDocument();
    fireEvent.keyDown(correctedPriceInput, { key: "Enter" });
    expect(screen.getByText("7.100")).toBeInTheDocument();
    expect(screen.queryByLabelText("Giá cần xử lý")).not.toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(screen.getByLabelText("Quyết định cho Bút bi TL027")).toHaveValue("pending");
    fireEvent.change(screen.getByLabelText("Quyết định cho Bút bi TL027"), {
      target: { value: "create" },
    });
    expect(importButton).toBeEnabled();

    fireEvent.click(importButton);
    await waitFor(() => expect(applyProductImport.execute).toHaveBeenCalledTimes(1));
    expect(applyProductImport.execute).toHaveBeenCalledWith({
      preview: expect.any(Object),
      decisions: {
        TL027: {
          action: "create",
          acceptedPrices: { 2: 7100 },
        },
      },
    });
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  });

  it("prioritizes candidates with warnings and errors to the top and supports filtering", async () => {
    const multiPreview: ProductImportPreview = {
      sourceRowCount: 3,
      productCount: 3,
      unitCount: 3,
      candidates: [
        {
          key: "CLEAN_A",
          sku: "SKU_CLEAN",
          name: "Sản phẩm sạch A",
          brand: null,
          category: "Tổng hợp",
          units: [
            {
              sourceRowNumber: 2,
              sourceSku: "SKU_CLEAN",
              name: "Cái",
              sourcePrice: 10000,
              acceptedPrice: 10000,
              suggestedPrice: null,
              requiresPriceDecision: false,
            },
          ],
          aliases: [],
          sourceRows: [2],
          issues: [],
          matchKind: "new",
          exactMatches: [],
          possibleMatches: [],
          requiresDecision: false,
          isBlocked: false,
        },
        {
          key: "WARNING_B",
          sku: "SKU_WARN",
          name: "Sản phẩm cảnh báo B",
          brand: null,
          category: "Tổng hợp",
          units: [
            {
              sourceRowNumber: 3,
              sourceSku: "SKU_WARN",
              name: "Cái",
              sourcePrice: 5000.5,
              acceptedPrice: null,
              suggestedPrice: 5000,
              requiresPriceDecision: true,
            },
          ],
          aliases: [],
          sourceRows: [3],
          issues: [
            {
              code: "fractional_price",
              severity: "warning",
              message: "Giá có phần lẻ.",
              sourceRows: [3],
            },
          ],
          matchKind: "new",
          exactMatches: [],
          possibleMatches: [],
          requiresDecision: true,
          isBlocked: false,
        },
        {
          key: "ERROR_C",
          sku: "SKU_ERR",
          name: "Sản phẩm lỗi C",
          brand: null,
          category: null,
          units: [],
          aliases: [],
          sourceRows: [4],
          issues: [
            {
              code: "missing_unit",
              severity: "error",
              message: "Thiếu đơn vị cơ bản.",
              sourceRows: [4],
            },
          ],
          matchKind: "new",
          exactMatches: [],
          possibleMatches: [],
          requiresDecision: false,
          isBlocked: true,
        },
      ],
    };

    const previewProductImport = { execute: vi.fn().mockResolvedValue(ok(multiPreview)) };
    const applyProductImport = {
      execute: vi
        .fn()
        .mockResolvedValue(
          ok({ created: 0, updated: 0, skipped: 0, unitsCreated: 0, aliasesCreated: 0 }),
        ),
    };

    render(
      <ProductImportDialog
        actions={{ previewProductImport, applyProductImport }}
        onClose={() => undefined}
        onImported={() => undefined}
      />,
    );

    const file = new File(["xlsx"], "products.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    fireEvent.change(screen.getByLabelText("Chọn file .xlsx"), { target: { files: [file] } });

    expect(await screen.findByText("Sản phẩm cảnh báo B")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 chưa xử lý");

    // Verify ordering: error item first, then warning item, then clean item
    const productNames = screen
      .getAllByText(/Sản phẩm (lỗi C|cảnh báo B|sạch A)/)
      .map((el) => el.textContent);
    expect(productNames).toEqual(["Sản phẩm lỗi C", "Sản phẩm cảnh báo B", "Sản phẩm sạch A"]);

    // Test filter "Cần xử lý"
    fireEvent.click(screen.getByRole("button", { name: /Cần xử lý \(2\)/ }));
    expect(screen.getByText("Sản phẩm lỗi C")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm cảnh báo B")).toBeInTheDocument();
    expect(screen.queryByText("Sản phẩm sạch A")).not.toBeInTheDocument();

    // Test filter "Hợp lệ"
    fireEvent.click(screen.getByRole("button", { name: /Hợp lệ \(1\)/ }));
    expect(screen.getByText("Sản phẩm sạch A")).toBeInTheDocument();
    expect(screen.queryByText("Sản phẩm lỗi C")).not.toBeInTheDocument();
    expect(screen.queryByText("Sản phẩm cảnh báo B")).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText("10.000"));
    expect(screen.getByLabelText("Giá nhập cho Sản phẩm sạch A - Cái")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Giá nhập cho Sản phẩm sạch A - Cái"), {
      key: "Escape",
    });

    // Test filter "Tất cả"
    fireEvent.click(screen.getByRole("button", { name: /Tất cả \(3\)/ }));
    expect(screen.getByText("Sản phẩm lỗi C")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm cảnh báo B")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm sạch A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua dòng lỗi" }));
    fireEvent.click(screen.getByRole("button", { name: "Làm tròn 1 giá" }));
    expect(screen.getByRole("button", { name: /Cần xử lý \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập 2 sản phẩm" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Tìm trong file import"), {
      target: { value: "sku_clean" },
    });
    expect(screen.getByText("Sản phẩm sạch A")).toBeInTheDocument();
    expect(screen.queryByText("Sản phẩm cảnh báo B")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tìm trong file import"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Đã bỏ qua — hoàn tác" }));
    expect(screen.getByRole("button", { name: "Nhập 3 sản phẩm" })).toBeDisabled();
  });
});

function preview(): ProductImportPreview {
  const existing = Product.create({
    id: PRODUCT_ID,
    sku: "BB-TL-027",
    name: "Bút bi Thiên Long 027",
    brand: "Thiên Long",
    category: "Viết",
    createdAt: NOW,
    units: [
      Unit.create({ id: UNIT_ID, productId: PRODUCT_ID, name: "Cây", price: 3200, createdAt: NOW }),
    ],
  });
  return {
    sourceRowCount: 1,
    productCount: 1,
    unitCount: 1,
    candidates: [
      {
        key: "TL027",
        sku: "TL027",
        name: "Bút bi TL027",
        brand: null,
        category: "Viết",
        units: [
          {
            sourceRowNumber: 2,
            sourceSku: "TL027",
            name: "Cây",
            sourcePrice: 7083.33,
            acceptedPrice: null,
            suggestedPrice: 7083,
            requiresPriceDecision: true,
          },
        ],
        aliases: [],
        sourceRows: [2],
        issues: [
          {
            code: "fractional_price",
            severity: "warning",
            message: "Giá có phần lẻ.",
            sourceRows: [2],
          },
        ],
        matchKind: "possible-duplicate",
        exactMatches: [],
        possibleMatches: [
          {
            product: existing,
            score: 90,
            confidence: "high",
            evidence: [
              {
                kind: "model",
                imported: "027",
                existing: "027",
                points: 35,
                explanation: "Cùng mã model.",
              },
            ],
          },
        ],
        requiresDecision: true,
        isBlocked: false,
      },
    ],
  };
}
