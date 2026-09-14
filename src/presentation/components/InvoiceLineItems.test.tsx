import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { ok } from "../../application/shared/Result";
import { InvoiceLineItems } from "./InvoiceLineItems";

const now = "2026-09-14T01:00:00.000Z";
function item() {
  return InvoiceItem.create({
    id: crypto.randomUUID(),
    invoiceId: "11111111-1111-4111-8111-111111111111",
    productId: crypto.randomUUID(),
    unitId: crypto.randomUUID(),
    productName: "Coffee",
    productSku: null,
    productBrand: null,
    unitName: "Can",
    quantity: 1,
    unitPrice: 1000,
    createdAt: now,
  });
}
function mockGeometry() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches(".invoice-grid-scroll"))
      return { top: 0, bottom: 200, height: 200 } as DOMRect;
    if (this.matches("thead, tfoot")) return { height: 25 } as DOMRect;
    const number = Number(this.querySelector(".grid-row-number")?.textContent ?? 0);
    return { top: 25 + number * 25, bottom: 50 + number * 25, height: 25 } as DOMRect;
  });
}
const props = {
  isLoading: false,
  isReady: true,
  onCommit: vi.fn(async () => null),
  onRemove: vi.fn(async () => null),
  searchProducts: { execute: () => ok([]) },
};

it("reveals a new trailing row without moving keyboard focus or scrolling on subsequent edits", () => {
  const geometry = mockGeometry();
  try {
    render(<InvoiceLineItems {...props} items={Array.from({ length: 8 }, item)} />);
    const container = document.querySelector<HTMLElement>(".invoice-grid-scroll")!;
    expect(container.scrollTop).toBe(0);
    const input = screen.getByLabelText("Tên hàng hóa dòng 9");
    input.focus();
    fireEvent.change(input, { target: { value: "C" } });
    expect(container.scrollTop).toBeGreaterThan(0);
    expect(document.activeElement).toBe(input);
    container.scrollTop = 80;
    fireEvent.change(input, { target: { value: "Coffee" } });
    expect(container.scrollTop).toBe(80);
  } finally {
    geometry.mockRestore();
  }
});

it("scrolls to added item identities but preserves position for edits, deletion, sorting, and filtering", () => {
  const geometry = mockGeometry();
  try {
    const items = Array.from({ length: 8 }, item);
    const view = render(<InvoiceLineItems {...props} items={items} />);
    const container = document.querySelector<HTMLElement>(".invoice-grid-scroll")!;
    container.scrollTop = 65;
    view.rerender(
      <InvoiceLineItems {...props} items={items.map((line) => line.update({ quantity: 2 }))} />,
    );
    expect(container.scrollTop).toBe(65);
    view.rerender(<InvoiceLineItems {...props} items={items.slice(1)} />);
    expect(container.scrollTop).toBe(65);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Coffee" } });
    expect(container.scrollTop).toBe(65);
    const sort = screen.getByRole("button", { name: /Tên hàng hóa/ });
    fireEvent.click(sort);
    expect(container.scrollTop).toBe(65);
    view.rerender(<InvoiceLineItems {...props} items={[...items.slice(1), item()]} />);
    expect(container.scrollTop).toBeGreaterThan(65);
  } finally {
    geometry.mockRestore();
  }
});
