import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { Invoice } from "../domain/entities/Invoice";
import { InvoiceItem } from "../domain/entities/InvoiceItem";
import { Product } from "../domain/entities/Product";
import { Unit } from "../domain/entities/Unit";
import { ProductAlias } from "../domain/entities/ProductAlias";
import { InvoiceReceiptPreviewModal } from "../presentation/components/InvoiceReceiptPreviewModal";
import { InvoiceHistoryScreen } from "../presentation/screens/InvoiceHistoryScreen";
import { FuseProductSearchIndex } from "../infrastructure/search/FuseProductSearchIndex";
import { ReactivateProduct } from "../application/use-cases/ReactivateProduct";
import { InMemoryProductRepository } from "../test/doubles/InMemoryProductRepository";
import { LoadProductSearchIndex } from "../application/use-cases/LoadProductSearchIndex";
import { SearchProducts } from "../application/use-cases/SearchProducts";
import { InMemoryProductAliasRepository } from "../test/doubles/InMemoryProductAliasRepository";
import { InvoiceProductCell } from "../presentation/components/InvoiceProductCell";
import { ProductSearchStartup } from "../presentation/components/ProductSearchStartup";
import { ok, err } from "../application/shared/Result";
const NOW = "2026-01-01T00:00:00.000Z";
it("retrying startup loads the complete catalog and makes search ready", async () => {
  const id = crypto.randomUUID();
  const product = Product.create({
    id,
    sku: null,
    brand: null,
    category: null,
    name: "Coffee",
    createdAt: NOW,
    units: [
      Unit.create({
        id: crypto.randomUUID(),
        productId: id,
        name: "Can",
        price: 1000,
        createdAt: NOW,
      }),
    ],
  });
  const products = new InMemoryProductRepository([product]);
  const index = new FuseProductSearchIndex();
  products.failNext("list", "transient lock");
  const loader = new LoadProductSearchIndex(products, new InMemoryProductAliasRepository(), index);
  render(
    <ProductSearchStartup loader={loader}>
      <p>Catalog ready</p>
    </ProductSearchStartup>,
  );
  await screen.findByRole("alert");
  expect(index.isReady).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Thử tải lại danh mục" }));
  await screen.findByText("Catalog ready");
  expect(new SearchProducts(index).execute({ query: "Coffee" })).toMatchObject({
    ok: true,
    value: [{ product: { id } }],
  });
});
it("duplicate names without SKU show brand and category", () => {
  const products = ["Brand A", "Brand B"].map((brand) => {
    const id = crypto.randomUUID();
    return Product.create({
      id,
      name: "Coffee",
      sku: null,
      brand,
      category: brand,
      createdAt: NOW,
      units: [
        Unit.create({
          id: crypto.randomUUID(),
          productId: id,
          name: "Box",
          price: brand === "Brand A" ? 10000 : 20000,
          createdAt: NOW,
        }),
      ],
    });
  });
  render(
    <InvoiceProductCell
      value="Coffee"
      label="Product"
      isDirty={false}
      searchProducts={{
        execute: () =>
          ok(
            products.map((product) => ({
              product,
              activeUnitNames: ["Box"],
              matchedBy: "fuzzy" as const,
              score: 0,
            })),
          ),
      }}
      onChange={() => {}}
      onSelect={() => {}}
      onBlur={() => {}}
    />,
  );
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  const options = screen.getAllByRole("option");
  expect(options[0]).toHaveTextContent("Brand A");
  expect(options[1]).toHaveTextContent("Brand B");
});
function item(invoiceId: string, quantity = 1, unitPrice = 10000) {
  return InvoiceItem.create({
    id: crypto.randomUUID(),
    invoiceId,
    productId: crypto.randomUUID(),
    unitId: crypto.randomUUID(),
    productName: "Example",
    productSku: null,
    productBrand: null,
    unitName: "Box",
    quantity,
    unitPrice,
    createdAt: NOW,
  });
}
it("receipt handles page sums larger than safe integers without losing precision", () => {
  const id = crypto.randomUUID();
  const max = Number.MAX_SAFE_INTEGER;
  const lines = Array.from({ length: 29 }, () => item(id, 1, 0));
  lines[0] = item(id, -1, max);
  lines[14] = item(id, 1, max);
  lines[15] = item(id, 1, max);
  const invoice = Invoice.createDraft({ id, invoiceNumber: 1, createdAt: NOW }).replaceDraftItems(
    lines,
    NOW,
  );
  expect(invoice.total).toBe(max);
  const view = render(
    <InvoiceReceiptPreviewModal invoice={invoice} isOpen={false} onClose={() => {}} />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<InvoiceReceiptPreviewModal invoice={invoice} isOpen onClose={() => {}} />);
  expect(screen.getAllByText((BigInt(max) * 2n).toLocaleString("vi-VN")).length).toBeGreaterThan(0);
});
it("receipt displays negative return discounts", () => {
  const id = crypto.randomUUID();
  const line = item(id, -1, 10000).update({ discountBasisPoints: 1000 });
  const invoice = Invoice.createDraft({ id, invoiceNumber: 1, createdAt: NOW })
    .replaceDraftItems([line], NOW)
    .complete(NOW);
  const { container } = render(
    <InvoiceReceiptPreviewModal invoice={invoice} isOpen onClose={() => {}} />,
  );
  expect(line.discountAmount).toBe(-1000);
  expect(container.querySelector(".item-row .td-ck-amount")?.textContent).toBe("(1.000)");
  expect(container.querySelector(".td-total-ck")?.textContent).toBe("(1.000)");
});
it("failed history load displays an error and permits retry", async () => {
  render(
    <InvoiceHistoryScreen
      actions={{
        listInvoices: {
          execute: async () => err({ code: "persistence", operation: "list", message: "locked" }),
        },
      }}
    />,
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByText("Chưa có hóa đơn bán hàng nào được hoàn thành trong hệ thống."),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Thử lại" })).toBeEnabled();
});
it("reactivating after cold-start restores product aliases to search", async () => {
  const id = crypto.randomUUID();
  const p = Product.create({
    id,
    name: "Coffee",
    sku: null,
    brand: null,
    category: null,
    createdAt: NOW,
    units: [
      Unit.create({
        id: crypto.randomUUID(),
        productId: id,
        name: "Can",
        price: 10000,
        createdAt: NOW,
      }),
    ],
  });
  const alias = ProductAlias.create({
    id: crypto.randomUUID(),
    productId: id,
    alias: "UniqueMoonlight",
    createdAt: NOW,
  });
  const index = new FuseProductSearchIndex();
  index.replace([], []); // Startup excludes inactive products AND their aliases in Rust.
  const repo = new InMemoryProductRepository([p.deactivate(NOW)]);
  expect(
    (
      await new ReactivateProduct(
        repo,
        { now: () => NOW },
        index,
        new InMemoryProductAliasRepository([alias]),
      ).execute({ productId: id })
    ).ok,
  ).toBe(true);

  expect(index.search("UniqueMoonlight", 10)).toHaveLength(1);
});

it("an exact ID miss does not search product names or aliases", () => {
  const id = crypto.randomUUID();
  const missing = crypto.randomUUID();
  const product = Product.create({
    id,
    sku: null,
    brand: null,
    category: null,
    name: missing,
    createdAt: NOW,
    units: [
      Unit.create({
        id: crypto.randomUUID(),
        productId: id,
        name: "Can",
        price: 1000,
        createdAt: NOW,
      }),
    ],
  });
  const index = new FuseProductSearchIndex();
  index.replace([product], []);
  expect(index.search(missing, 1)).toHaveLength(1);
  expect(
    new SearchProducts(index).execute({ query: missing, limit: 1, exactIdOnly: true }),
  ).toEqual(ok([]));
});
