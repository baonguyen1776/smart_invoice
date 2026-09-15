import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "../../application/shared/Result";
import { UpdateInvoiceOldDebt } from "../../application/use-cases/UpdateInvoiceOldDebt";
import { CompleteInvoice } from "../../application/use-cases/CompleteInvoice";
import { OverwriteCompletedInvoice } from "../../application/use-cases/OverwriteCompletedInvoice";
import { UpdateInvoiceCustomer } from "../../application/use-cases/UpdateInvoiceCustomer";
import { ApplyInvoiceItemChange } from "../../application/use-cases/ApplyInvoiceItemChange";
import { InMemoryInvoiceRepository } from "../../test/doubles/InMemoryInvoiceRepository";
import { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { Product } from "../../domain/entities/Product";
import { Unit } from "../../domain/entities/Unit";
import { CreateInvoiceScreen, type InvoiceScreenActions } from "./CreateInvoiceScreen";

const NOW = "2026-09-10T01:00:00.000Z";
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_SINGLE_UNIT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_MULTI_UNIT_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_CAN_ID = "44444444-4444-4444-8444-444444444444";
const UNIT_CRATE_ID = "55555555-5555-4555-8555-555555555555";
const UNIT_PACK_ID = "66666666-6666-4666-8666-666666666666";

const ITEM_ID_1 = "77777777-7777-4777-8777-777777777771";

function makeDraftInvoice(items: readonly InvoiceItem[] = []): Invoice {
  return Invoice.rehydrate({
    id: INVOICE_ID,
    invoiceNumber: 1,
    status: "draft",
    total: items.reduce((sum, item) => sum + item.payment, 0),
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    items,
  });
}

function makeCompletedInvoice(items: readonly InvoiceItem[] = []): Invoice {
  return Invoice.rehydrate({
    id: INVOICE_ID,
    invoiceNumber: 1,
    status: "completed",
    total: items.reduce((sum, item) => sum + item.payment, 0),
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    items,
  });
}

function makeSingleUnitProduct(): Product {
  return Product.create({
    id: PRODUCT_SINGLE_UNIT_ID,
    sku: "CF-001",
    name: "Cà phê sữa đá",
    brand: "Highlands",
    category: "Đồ uống",
    createdAt: NOW,
    units: [
      Unit.create({
        id: UNIT_CAN_ID,
        productId: PRODUCT_SINGLE_UNIT_ID,
        name: "Ly",
        price: 29000,
        createdAt: NOW,
      }),
    ],
  });
}

function makeMultiUnitProduct(): Product {
  return Product.create({
    id: PRODUCT_MULTI_UNIT_ID,
    sku: "COCA-01",
    name: "Nước ngọt Coca-Cola",
    brand: "Coca-Cola",
    category: "Đồ uống",
    createdAt: NOW,
    units: [
      Unit.create({
        id: UNIT_CAN_ID,
        productId: PRODUCT_MULTI_UNIT_ID,
        name: "Lon",
        price: 10000,
        createdAt: NOW,
      }),
      Unit.create({
        id: UNIT_PACK_ID,
        productId: PRODUCT_MULTI_UNIT_ID,
        name: "Lốc 6 lon",
        price: 55000,
        createdAt: NOW,
      }),
      Unit.create({
        id: UNIT_CRATE_ID,
        productId: PRODUCT_MULTI_UNIT_ID,
        name: "Thùng 24 lon",
        price: 210000,
        createdAt: NOW,
      }),
    ],
  });
}

function makeInvoiceItem(
  id: string,
  product: Product,
  unit: Unit,
  quantity = 1,
  unitPrice = unit.price,
  discountBasisPoints = 0,
  note?: string,
): InvoiceItem {
  return InvoiceItem.create({
    id,
    invoiceId: INVOICE_ID,
    productId: product.id,
    unitId: unit.id,
    productName: product.name,
    productSku: product.sku ?? null,
    productBrand: product.brand ?? null,
    unitName: unit.name,
    unitPrice,
    quantity,
    discountBasisPoints,
    note,
    createdAt: NOW,
  });
}

function makeActions(initialInvoice = makeDraftInvoice()) {
  const repository = new InMemoryInvoiceRepository([initialInvoice]);
  const useCase = new ApplyInvoiceItemChange(
    repository,
    { generate: () => crypto.randomUUID() },
    { now: () => NOW },
  );
  const actions: InvoiceScreenActions = {
    createInvoiceDraft: { execute: vi.fn(async () => ok(initialInvoice)) },
    updateInvoiceOldDebt: new UpdateInvoiceOldDebt(repository, { now: () => NOW }),
    updateInvoiceCustomer: new UpdateInvoiceCustomer(repository, { now: () => NOW }),
    applyInvoiceItemChange: { execute: vi.fn((input) => useCase.execute(input)) },
    searchProducts: {
      execute: vi.fn(({ query }) =>
        ok(
          [makeSingleUnitProduct(), makeMultiUnitProduct()]
            .filter(
              (product) =>
                product.id === query ||
                product.name.toLowerCase().includes(query.toLowerCase()) ||
                product.sku?.toLowerCase().includes(query.toLowerCase()),
            )
            .map((product) => ({
              product,
              activeUnitNames: product.units.map((unit) => unit.name),
              matchedBy: "fuzzy" as const,
              score: 0,
            })),
        ),
      ),
    },
  };
  return { actions, repository };
}
async function ready(actions: InvoiceScreenActions) {
  render(<CreateInvoiceScreen actions={actions} />);
  await screen.findByText("#000001");
}
function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}
function edit(label: string, value: string) {
  const field = input(label);
  fireEvent.change(field, { target: { value } });
  return field;
}
async function selectProduct(query = "Cà phê", row = 1) {
  const field = edit(`Tên hàng hóa dòng ${row}`, query);
  fireEvent.keyDown(field, { key: "Enter" });
  await waitFor(() => expect(field).toHaveAttribute("data-dirty", "false"));
}
function populated() {
  const product = makeSingleUnitProduct();
  return makeActions(makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]));
}

describe("Invoice spreadsheet", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("starts with one focused editable row and appends only after input", async () => {
    const { actions } = makeActions();
    await ready(actions);
    await waitFor(() => expect(input("Tên hàng hóa dòng 1")).toHaveFocus());
    expect(input("Tên hàng hóa dòng 1")).toHaveAttribute("placeholder", "-");
    expect(screen.queryByLabelText("Tên hàng hóa dòng 2")).not.toBeInTheDocument();
    edit("Tên hàng hóa dòng 1", "C");
    expect(input("Tên hàng hóa dòng 2")).toHaveValue("");
    edit("Tên hàng hóa dòng 1", "Cà phê");
    expect(screen.queryByLabelText("Tên hàng hóa dòng 3")).not.toBeInTheDocument();
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
  });

  it("selects a product inline, retains focus and supports units without a modal", async () => {
    const { actions, repository } = makeActions();
    await ready(actions);
    await selectProduct("Coca");
    expect(input("Đvt dòng 1")).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(input("Đvt dòng 1"), { target: { value: UNIT_PACK_ID } });
    await waitFor(() =>
      expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].unitName).toBe("Lốc 6 lon"),
    );
    expect(input("Đơn giá dòng 1")).toHaveValue("55.000");
    expect(input("Tên hàng hóa dòng 2")).toHaveValue("");
    expect(screen.queryByLabelText("Tên hàng hóa dòng 3")).not.toBeInTheDocument();
  });

  it("moves Enter/Tab through editable columns and into the next row", async () => {
    const { actions } = populated();
    await ready(actions);
    const labels = [
      "Tên hàng hóa dòng 1",
      "Đvt dòng 1",
      "Số lượng dòng 1",
      "Đơn giá dòng 1",
      "CK (%) dòng 1",
      "Tên hàng hóa dòng 2",
    ];
    for (let index = 0; index < labels.length - 1; index++) {
      act(() => input(labels[index]).focus());
      fireEvent.keyDown(input(labels[index]), { key: index % 2 ? "Tab" : "Enter" });
      expect(input(labels[index + 1])).toHaveFocus();
    }
    fireEvent.keyDown(input(labels.slice(-1)[0]!), { key: "Tab", shiftKey: true });
    expect(input("CK (%) dòng 1")).toHaveFocus();
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
  });

  it("recalculates CK and inline amounts before blur, then saves the net invoice total", async () => {
    const { actions, repository } = populated();
    await ready(actions);
    edit("Số lượng dòng 1", "3");
    const field = edit("CK (%) dòng 1", "12,50");
    const row = screen.getByRole("table").querySelector("tr[data-row-id]")!;
    expect(row).toHaveTextContent("87.000");
    expect(row).toHaveTextContent("10.875");
    expect(row).toHaveTextContent("76.125");
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
    fireEvent.blur(field);
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.total).toBe(76125));
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].discountBasisPoints).toBe(1250);
    expect(screen.getByRole("complementary", { name: "Tổng quan hóa đơn" })).toHaveTextContent(
      "76.125 ₫",
    );
  });

  it.each(["", "0", "1.5", "-1.5", "abc", "9007199254740992", "-9007199254740992"])(
    "rejects invalid quantity %s without saving",
    async (value) => {
      const { actions } = populated();
      await ready(actions);
      fireEvent.blur(edit("Số lượng dòng 1", value));
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
    },
  );

  it("accepts negative quantity for return items and formats parenthesized negative amounts", async () => {
    const { actions, repository } = populated();
    await ready(actions);
    fireEvent.blur(edit("Số lượng dòng 1", "-2"));
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].quantity).toBe(-2));
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].subtotal).toBe(-58000);
    expect(screen.getByRole("complementary", { name: "Tổng quan hóa đơn" })).toHaveTextContent(
      "(58.000 ₫)",
    );
  });

  it.each(["-1", "100.01", "1.234", "abc", "1e1"])("rejects invalid CK %s", async (value) => {
    const { actions } = populated();
    await ready(actions);
    fireEvent.blur(edit("CK (%) dòng 1", value));
    expect(await screen.findByRole("alert")).toHaveTextContent("CK");
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
  });

  it("accepts zero price and 100% discount, while rejecting fractional VND", async () => {
    const { actions, repository } = populated();
    await ready(actions);
    fireEvent.blur(edit("Đơn giá dòng 1", "1.5"));
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
    fireEvent.blur(edit("Đơn giá dòng 1", "0"));
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.total).toBe(0));
    fireEvent.blur(edit("CK (%) dòng 1", "100"));
    await waitFor(() =>
      expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].discountBasisPoints).toBe(10000),
    );
  });

  it("preserves edits after failure and retries the same row without duplicating it", async () => {
    const { actions, repository } = makeActions();
    vi.mocked(actions.applyInvoiceItemChange.execute).mockResolvedValueOnce(
      err({ code: "persistence", operation: "save_draft", message: "offline" }),
    );
    await ready(actions);
    fireEvent.keyDown(edit("Tên hàng hóa dòng 1", "Cà phê"), { key: "Enter" });
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(input("Tên hàng hóa dòng 1")).toHaveValue("Cà phê sữa đá");
    fireEvent.blur(input("Số lượng dòng 1"));
    await waitFor(() => expect(repository.saveDraftCalls).toHaveLength(1));
    expect(repository.saveDraftCalls[0].items).toHaveLength(1);
    expect(input("Tên hàng hóa dòng 2")).toHaveValue("");
  });

  it("queues edits typed while adding the same row and never creates a duplicate", async () => {
    const { actions, repository } = makeActions();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actual = new ApplyInvoiceItemChange(
      repository,
      { generate: () => crypto.randomUUID() },
      { now: () => NOW },
    );
    vi.mocked(actions.applyInvoiceItemChange.execute)
      .mockReset()
      .mockImplementationOnce(async (value) => {
        await gate;
        return actual.execute(value);
      })
      .mockImplementation((value) => actual.execute(value));
    await ready(actions);
    fireEvent.keyDown(edit("Tên hàng hóa dòng 1", "Coca"), { key: "Enter" });
    fireEvent.blur(edit("Số lượng dòng 1", "3"));
    fireEvent.blur(edit("CK (%) dòng 1", "10"));
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.total).toBe(27000));
    expect(repository.saveDraftCalls.slice(-1)[0]?.items).toHaveLength(1);
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].quantity).toBe(3);
    expect(input("CK (%) dòng 1")).toHaveValue("10");
  });

  it("deletes unfinished rows, renumbers, and always retains a blank row", async () => {
    const { actions } = makeActions();
    await ready(actions);
    edit("Tên hàng hóa dòng 1", "unfinished");
    edit("Số lượng dòng 2", "2");
    expect(input("Tên hàng hóa dòng 3")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    expect(input("Số lượng dòng 1")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    expect(input("Tên hàng hóa dòng 1")).toHaveValue("");
    expect(screen.queryByLabelText("Tên hàng hóa dòng 2")).not.toBeInTheDocument();
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
  });

  it("deletes saved rows and restores CK when undoing", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0]).update({
      discountBasisPoints: 1000,
    });
    const { actions, repository } = makeActions(makeDraftInvoice([item]));
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    const undo = await screen.findByRole("button", { name: /Hoàn tác/ });
    fireEvent.click(undo);
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.total).toBe(26100));
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].discountBasisPoints).toBe(1000);
  });

  it("filters/sorts without losing rows and keeps the insertion row last", async () => {
    const one = makeSingleUnitProduct(),
      two = makeMultiUnitProduct();
    const { actions } = makeActions(
      makeDraftInvoice([
        makeInvoiceItem(ITEM_ID_1, one, one.units[0]),
        makeInvoiceItem(crypto.randomUUID(), two, two.units[0]),
      ]),
    );
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: "Đơn giá" }));
    const body = screen.getByRole("table").querySelector("tbody")!;
    expect(within(body).getAllByRole("combobox")[0]).toHaveValue(two.name);
    edit("Lọc dòng hóa đơn", "Cà phê");
    expect(screen.queryByLabelText("Tên hàng hóa dòng 2")).not.toBeInTheDocument();
    expect(input("Tên hàng hóa dòng 3")).toHaveValue("");
    expect(body).toHaveTextContent("29.000");
  });

  it("supports product replacement inline and never changes catalog prices", async () => {
    const { actions, repository } = populated();
    await ready(actions);
    await selectProduct("Coca");
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0]).toMatchObject({
      id: ITEM_ID_1,
      productId: PRODUCT_MULTI_UNIT_ID,
      unitName: "Lon",
      unitPrice: 10000,
    });
    expect(makeSingleUnitProduct().units[0].price).toBe(29000);
  });

  it("offers catalog navigation for unmatched names without persisting invalid rows", async () => {
    const { actions } = makeActions();
    const navigate = vi.fn();
    render(<CreateInvoiceScreen actions={actions} onNavigateToProducts={navigate} />);
    await screen.findByText("#000001");
    edit("Tên hàng hóa dòng 1", "Mặt hàng mới");
    fireEvent.click(screen.getByRole("button", { name: "Thêm sản phẩm mới vào danh mục" }));
    expect(navigate).toHaveBeenCalledWith("Mặt hàng mới");
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
  });

  it("does not submit IME composition and preserves native text undo", async () => {
    const { actions } = makeActions();
    await ready(actions);
    const field = edit("Tên hàng hóa dòng 1", "Cà phê");
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    expect(actions.applyInvoiceItemChange.execute).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(field, { key: "z", ctrlKey: true })).toBe(true);
  });

  it("blocks completion while a cell is dirty and passes discounted totals after save", async () => {
    const { actions } = populated();
    const complete = vi.fn();
    render(<CreateInvoiceScreen actions={actions} onCompleteInvoice={complete} />);
    await screen.findByText("#000001");
    edit("CK (%) dòng 1", "5");
    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành" }));
    expect(complete).not.toHaveBeenCalled();
    fireEvent.blur(input("CK (%) dòng 1"));
    await waitFor(() => expect(input("CK (%) dòng 1")).toHaveAttribute("data-dirty", "false"));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ total: 27550 }));
  });

  it("allows entering customer information and supports keyboard navigation", async () => {
    const { actions } = makeActions();
    await ready(actions);
    const customerInput = screen.getByLabelText("Tên khách hàng");
    const phoneInput = screen.getByLabelText("Số điện thoại");
    const noteInput = screen.getByLabelText("Ghi chú");

    expect(customerInput).toBeVisible();
    expect(phoneInput).toBeVisible();
    expect(noteInput).toBeVisible();

    fireEvent.change(customerInput, { target: { value: "Anh Tuấn" } });
    expect(customerInput).toHaveValue("Anh Tuấn");

    fireEvent.change(phoneInput, { target: { value: "0901234567" } });
    expect(phoneInput).toHaveValue("0901234567");

    fireEvent.change(noteInput, { target: { value: "Giao buổi sáng" } });
    expect(noteInput).toHaveValue("Giao buổi sáng");

    // Enter on customerInput moves to phoneInput
    fireEvent.keyDown(customerInput, { key: "Enter" });
    expect(phoneInput).toHaveFocus();

    // Enter on phoneInput moves to the first product input
    fireEvent.keyDown(phoneInput, { key: "Enter" });
    expect(input("Tên hàng hóa dòng 1")).toHaveFocus();
  });

  it("allows viewing saved drafts and reopening any draft for editing with all data intact", async () => {
    const product = makeSingleUnitProduct();
    const draft1 = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
    const draft2 = Invoice.rehydrate({
      id: "99999999-9999-4999-8999-999999999999",
      invoiceNumber: 2,
      status: "draft",
      total: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      items: [],
    });

    const { actions: baseActions } = makeActions(draft2);
    const actions: InvoiceScreenActions = {
      ...baseActions,
      listInvoices: {
        execute: vi.fn(async () => ok([draft1, draft2])),
      },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000002");

    // Open drafts list
    const draftsButton = screen.getByRole("button", { name: /Bản nháp/ });
    fireEvent.click(draftsButton);

    // Dialog opens showing drafts
    expect(screen.getByRole("dialog", { name: "Bản nháp đã lưu" })).toBeVisible();
    expect(screen.getByText("#000001")).toBeVisible();

    // Reopen draft 1
    const openDraft1Button = screen.getByRole("button", { name: "Mở bản nháp" });
    fireEvent.click(openDraft1Button);

    // Screen now shows draft 1 with its items intact
    await screen.findByText("#000001");
    expect(screen.getByDisplayValue("Cà phê sữa đá")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Tổng quan hóa đơn" })).toHaveTextContent(
      "29.000 ₫",
    );
  });

  it("switches between drafts even if an input was dirty, cleanly resetting items", async () => {
    const product = makeSingleUnitProduct();
    const draft1 = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
    const draft2 = Invoice.rehydrate({
      id: "99999999-9999-4999-8999-999999999999",
      invoiceNumber: 2,
      status: "draft",
      total: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      items: [],
    });

    const { actions: baseActions } = makeActions(draft1);
    const actions: InvoiceScreenActions = {
      ...baseActions,
      listInvoices: {
        execute: vi.fn(async () => ok([draft1, draft2])),
      },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");
    expect(screen.getByDisplayValue("Cà phê sữa đá")).toBeVisible();

    // Mark an input dirty
    const qtyInput = screen.getByLabelText("Số lượng dòng 1");
    fireEvent.change(qtyInput, { target: { value: "999" } });

    // Open drafts list
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    expect(screen.getByRole("dialog", { name: "Bản nháp đã lưu" })).toBeVisible();

    // Switch to draft 2 (empty draft)
    const openDraft2Button = screen.getByRole("button", { name: "Mở bản nháp" });
    fireEvent.click(openDraft2Button);

    // Draft 2 is now open and has NO items (not even phantom rows)
    await screen.findByText("#000002");
    expect(screen.queryByDisplayValue("Cà phê sữa đá")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Tổng quan hóa đơn" })).toHaveTextContent("-");
  });

  it("allows deleting a draft from the drafts modal", async () => {
    const product = makeSingleUnitProduct();
    const draft1 = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
    const draft2 = Invoice.rehydrate({
      id: "99999999-9999-4999-8999-999999999999",
      invoiceNumber: 2,
      status: "draft",
      total: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      items: [],
    });

    const { actions: baseActions } = makeActions(draft1);
    const actions: InvoiceScreenActions = {
      ...baseActions,
      listInvoices: {
        execute: vi.fn(async () => ok([draft1, draft2])),
      },
      deleteInvoiceDraft: {
        execute: vi.fn(async () => ok(undefined)),
      },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    // Open drafts list
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    expect(screen.getByRole("dialog", { name: "Bản nháp đã lưu" })).toBeVisible();

    // Click delete draft #000002
    const deleteButton = screen.getByRole("button", { name: "Xóa bản nháp #000002" });
    fireEvent.click(deleteButton);

    expect(actions.deleteInvoiceDraft?.execute).toHaveBeenCalledWith(draft2.id);
  });

  it("automatically restores latest uncompleted draft on cold-start / crash recovery", async () => {
    const product = makeSingleUnitProduct();
    const restoredDraft = makeDraftInvoice([
      makeInvoiceItem(ITEM_ID_1, product, product.units[0], 3, 25000),
    ]);
    localStorage.setItem(
      `smart_invoice_customer_${restoredDraft.id}`,
      JSON.stringify({
        name: "Nguyễn Văn A",
        phone: "0901234567",
        note: "Giao gấp buổi trưa",
      }),
    );

    const { actions: baseActions } = makeActions(restoredDraft);
    const restoreSpy = vi.fn(async () => ok(restoredDraft));
    const actions: InvoiceScreenActions = {
      ...baseActions,
      restoreInvoiceDraft: { execute: restoreSpy },
    };

    render(<CreateInvoiceScreen actions={actions} />);

    await screen.findByText("#000001");
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Cà phê sữa đá")).toBeVisible();
    expect(screen.getByDisplayValue("3")).toBeVisible();
    expect(screen.getByLabelText("Đơn giá dòng 1")).toHaveValue("25.000");
    expect(screen.getByDisplayValue("Nguyễn Văn A")).toBeVisible();
    expect(screen.getByDisplayValue("0901234567")).toBeVisible();
    expect(screen.getByDisplayValue("Giao gấp buổi trưa")).toBeVisible();
  });

  it("does not report saved and displays actionable error when semantic save fails", async () => {
    const { actions } = makeActions();
    vi.mocked(actions.applyInvoiceItemChange.execute).mockResolvedValueOnce(
      err({ code: "persistence", operation: "save_draft", message: "disk failure" }),
    );
    await ready(actions);

    fireEvent.keyDown(edit("Tên hàng hóa dòng 1", "Cà phê"), { key: "Enter" });
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(
      screen.getAllByText("Chưa lưu được thay đổi. Hãy thử lại ô vừa sửa.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Đã lưu")).toBeNull();
  });
});

describe("Complete and overwrite completed invoices (#19)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("disables complete button when draft invoice has no items", async () => {
    const { actions: baseActions } = makeActions();
    const completeSpy = vi.fn(async () => ok(makeCompletedInvoice([])));
    const actions: InvoiceScreenActions = {
      ...baseActions,
      completeInvoice: { execute: completeSpy },
    };

    await ready(actions);

    const completeButton = screen.getByRole("button", { name: "Hoàn thành" });
    expect(completeButton).toBeDisabled();
    fireEvent.click(completeButton);
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("completes a draft invoice with items successfully and clears active draft id", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 2, 29000);
    const draft = makeDraftInvoice([item]);
    const completed = makeCompletedInvoice([item]);

    const { actions: baseActions } = makeActions(draft);
    const completeSpy = vi.fn(async () => ok(completed));
    const actions: InvoiceScreenActions = {
      ...baseActions,
      completeInvoice: { execute: completeSpy },
    };

    localStorage.setItem("smart_invoice_active_draft_id", draft.id);

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    const completeButton = screen.getByRole("button", { name: "Hoàn thành" });
    expect(completeButton).not.toBeDisabled();
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: draft.id }));
    });

    expect(screen.getByText("ĐÃ HOÀN TẤT")).toBeVisible();
    expect(screen.getByText("Đã hoàn thành hóa đơn #000001")).toBeVisible();
    expect(localStorage.getItem("smart_invoice_active_draft_id")).toBeNull();
  });

  it("shows error message when completeInvoice fails", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 2, 29000);
    const draft = makeDraftInvoice([item]);

    const { actions: baseActions } = makeActions(draft);
    const actions: InvoiceScreenActions = {
      ...baseActions,
      completeInvoice: {
        execute: vi.fn(async () =>
          err({ code: "invalid_state" as const, message: "Hóa đơn đã được chốt trước đó." }),
        ),
      },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành" }));

    await screen.findByText("Hóa đơn đã được chốt trước đó.");
  });

  it("only displays drafts in the drafts modal and opens completed invoices via editingInvoice", async () => {
    const draft = makeDraftInvoice([]);
    const completed = Invoice.rehydrate({
      id: "99999999-9999-4999-8999-999999999999",
      invoiceNumber: 99,
      status: "completed",
      total: 58000,
      customerName: "Khách VIP",
      customerPhone: "0912345678",
      customerAddress: null,
      customerNote: null,
      isPrinted: false,
      printedAt: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:05:00.000Z",
      completedAt: "2026-09-01T10:05:00.000Z",
      items: [
        InvoiceItem.rehydrate({
          id: "88888888-8888-4888-8888-888888888888",
          invoiceId: "99999999-9999-4999-8999-999999999999",
          productId: "77777777-7777-4777-8777-777777777777",
          unitId: "66666666-6666-4666-8666-666666666666",
          productName: "Cát xây tô",
          productSku: null,
          productBrand: null,
          unitName: "Khối",
          unitPrice: 29000,
          quantity: 2,
          subtotal: 58000,
          discountBasisPoints: 0,
          note: null,
          createdAt: "2026-09-01T10:00:00.000Z",
        }),
      ],
    });

    const { actions: baseActions } = makeActions(draft);
    const actions: InvoiceScreenActions = {
      ...baseActions,
      listInvoices: {
        execute: vi.fn(async () => ok([draft])),
      },
    };

    const { rerender } = render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    expect(screen.getByRole("dialog", { name: /Bản nháp đã lưu/ })).toBeVisible();

    // Verify there is NO "Đã hoàn thành" tab in the modal
    expect(screen.queryByRole("tab", { name: /Đã hoàn thành/ })).toBeNull();
    expect(screen.queryByText("Đã chốt")).toBeNull();

    // Close modal and pass editingInvoice (simulating opening from history)
    fireEvent.click(screen.getByRole("button", { name: "Đóng danh sách hóa đơn" }));

    rerender(<CreateInvoiceScreen actions={actions} editingInvoice={completed} />);
    await screen.findByText("#000099");
    expect(screen.getByRole("heading", { level: 1, name: "Chi tiết hóa đơn" })).toBeVisible();
    expect(screen.getByText("ĐÃ HOÀN TẤT")).toBeVisible();
    expect(screen.getByDisplayValue("Khách VIP")).toBeVisible();
  });

  it("stages changes in memory when editing a completed invoice without calling repository", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 1, 29000);
    const completed = makeCompletedInvoice([item]);

    const { actions: baseActions } = makeActions(completed);
    const applySpy = vi.fn();
    const actions: InvoiceScreenActions = {
      ...baseActions,
      applyInvoiceItemChange: { execute: applySpy },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");
    expect(screen.getByText("ĐÃ HOÀN TẤT")).toBeVisible();

    // Change quantity
    const qtyInput = screen.getByLabelText("Số lượng dòng 1");
    fireEvent.change(qtyInput, { target: { value: "5" } });
    fireEvent.keyDown(qtyInput, { key: "Enter" });

    await screen.findByRole("button", { name: "Lưu ghi đè" });
    expect(screen.queryByText("Hóa đơn đã chốt đang có thay đổi tạm thời.")).toBeNull();
    expect(applySpy).not.toHaveBeenCalled(); // Repository untouched!
    expect(screen.getByRole("button", { name: "Lưu ghi đè" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Hủy thay đổi" }).length).toBeGreaterThanOrEqual(
      1,
    );

    // Click Discard Changes
    fireEvent.click(screen.getAllByRole("button", { name: "Hủy thay đổi" })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Hóa đơn đã chốt đang có thay đổi tạm thời.")).toBeNull();
    });
    expect(screen.getByLabelText("Số lượng dòng 1")).toHaveValue(1);
  });

  it("opens confirmation dialog and commits overwrite when confirmed", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 1, 29000);
    const completed = makeCompletedInvoice([item]);

    const { actions: baseActions } = makeActions(completed);
    const overwriteSpy = vi.fn(
      async (input: {
        readonly invoiceId: string;
        readonly confirmed: boolean;
        readonly items: readonly InvoiceItem[];
      }) => {
        const updatedInvoice = completed.overwriteCompleted(input.items, NOW);
        return ok(updatedInvoice);
      },
    );
    const actions: InvoiceScreenActions = {
      ...baseActions,
      overwriteCompletedInvoice: { execute: overwriteSpy },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    // Edit quantity
    const qtyInput = screen.getByLabelText("Số lượng dòng 1");
    fireEvent.change(qtyInput, { target: { value: "3" } });
    fireEvent.keyDown(qtyInput, { key: "Enter" });

    await screen.findByRole("button", { name: "Lưu ghi đè" });

    // Click "Lưu ghi đè"
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu ghi đè" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi đè" }));

    // Confirmation dialog appears
    const dialog = screen.getByRole("dialog", { name: "Xác nhận ghi đè hóa đơn đã chốt?" });
    expect(dialog).toBeVisible();
    expect(overwriteSpy).not.toHaveBeenCalled();

    // Click "Hủy bỏ" in dialog
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy bỏ" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Xác nhận ghi đè hóa đơn đã chốt?" })).toBeNull();
    });
    expect(overwriteSpy).not.toHaveBeenCalled();

    // Click "Lưu ghi đè" again and confirm
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi đè" }));
    const confirmBtn = screen.getByRole("button", { name: "Xác nhận ghi đè" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(overwriteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: completed.id,
          confirmed: true,
        }),
      );
    });

    expect(screen.getByText("Đã cập nhật hóa đơn đã chốt #000001")).toBeVisible();
    expect(screen.queryByText("Hóa đơn đã chốt đang có thay đổi tạm thời.")).toBeNull();
  });

  it("creates a new draft invoice from completed invoice view", async () => {
    const product = makeSingleUnitProduct();
    const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 1, 29000);
    const completed = makeCompletedInvoice([item]);
    const freshDraft = makeDraftInvoice([]);

    const { actions: baseActions } = makeActions(completed);
    const createSpy = vi
      .fn()
      .mockResolvedValueOnce(ok(completed))
      .mockResolvedValueOnce(ok(freshDraft));
    const actions: InvoiceScreenActions = {
      ...baseActions,
      createInvoiceDraft: { execute: createSpy },
    };

    render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");

    const newBtn = screen.getByRole("button", { name: "Tạo hóa đơn mới" });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    expect(screen.getByText("Tạo hóa đơn mới")).toBeVisible();
    expect(screen.queryByText("ĐÃ HOÀN TẤT")).toBeNull();
  });

  describe("Line item notes (#29)", () => {
    it("allows entering a per-line note via note action button and persists it via semantic change", async () => {
      const { actions } = populated();
      await ready(actions);

      // Click note action button next to trash button
      const noteBtn = screen.getByRole("button", { name: "Thêm ghi chú dòng 1" });
      fireEvent.click(noteBtn);

      const noteInput = screen.getByLabelText("Nội dung ghi chú dòng 1");
      expect(noteInput).toHaveValue("");

      fireEvent.change(noteInput, { target: { value: "Đã giao đợt 1" } });
      fireEvent.blur(noteInput);

      await waitFor(() => {
        expect(actions.applyInvoiceItemChange.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            change: expect.objectContaining({
              type: "update",
              values: expect.objectContaining({
                note: "Đã giao đợt 1",
              }),
            }),
          }),
        );
      });
    });

    it("filters line items by per-line note keyword", async () => {
      const { actions } = populated();
      await ready(actions);

      // Click note action button to open subrow
      const noteBtn = screen.getByRole("button", { name: "Thêm ghi chú dòng 1" });
      fireEvent.click(noteBtn);

      const noteInput = screen.getByLabelText("Nội dung ghi chú dòng 1");
      fireEvent.change(noteInput, { target: { value: "hàng tặng khuyến mãi" } });
      fireEvent.blur(noteInput);

      await waitFor(() => {
        expect(actions.applyInvoiceItemChange.execute).toHaveBeenCalled();
      });

      const filterInput = screen.getByPlaceholderText("Lọc hàng hóa…");
      fireEvent.change(filterInput, { target: { value: "khuyến mãi" } });

      expect(screen.getByLabelText("Tên hàng hóa dòng 1")).toBeVisible();

      fireEvent.change(filterInput, { target: { value: "không tồn tại" } });
      expect(screen.queryByLabelText("Tên hàng hóa dòng 1")).toBeNull();
    });

    it("clears per-line note via clear button and collapses the subrow", async () => {
      const product = makeSingleUnitProduct();
      const itemWithNote = makeInvoiceItem(
        ITEM_ID_1,
        product,
        product.units[0],
        1,
        29000,
        0,
        "Đã giao trước 1 phần",
      );
      const { actions } = makeActions(makeDraftInvoice([itemWithNote]));
      await ready(actions);

      // Note subrow is automatically visible because note has content
      const noteInput = screen.getByLabelText("Nội dung ghi chú dòng 1");
      expect(noteInput).toHaveValue("Đã giao trước 1 phần");

      const clearBtn = screen.getByLabelText("Xóa ghi chú dòng 1");
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(actions.applyInvoiceItemChange.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            change: expect.objectContaining({
              type: "update",
              values: expect.objectContaining({
                note: null,
              }),
            }),
          }),
        );
      });

      // Subrow is collapsed
      expect(screen.queryByLabelText("Nội dung ghi chú dòng 1")).toBeNull();
    });

    it("renders per-line note as compact inline element inside product cell without creating extra tr subrows (Option B)", async () => {
      const product = makeSingleUnitProduct();
      const itemWithNote = makeInvoiceItem(
        ITEM_ID_1,
        product,
        product.units[0],
        1,
        29000,
        0,
        "Đã giao trước 1 phần",
      );
      const { actions } = makeActions(makeDraftInvoice([itemWithNote]));
      await ready(actions);

      // Verify no extra subrow tr exists in table
      expect(document.querySelector(".invoice-grid-note-subrow")).toBeNull();

      // Verify note input is rendered inside td.grid-cell-product
      const noteInput = screen.getByLabelText("Nội dung ghi chú dòng 1");
      const productCell = noteInput.closest("td.grid-cell-product");
      expect(productCell).not.toBeNull();
      expect(productCell).toHaveClass("has-inline-note");

      // Verify product input is also inside the same cell
      const productInput = screen.getByLabelText("Tên hàng hóa dòng 1");
      expect(productInput.closest("td.grid-cell-product")).toBe(productCell);

      // Verify the tr contains exactly one row for this item
      const tr = productCell?.closest("tr");
      expect(tr?.getAttribute("data-row-id")).toBe(ITEM_ID_1);
    });
  });

  describe("Receipt print preview modal (#37)", () => {
    it("automatically opens receipt print preview modal upon invoice completion", async () => {
      const product = makeSingleUnitProduct();
      const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 2, 29000);
      const draft = makeDraftInvoice([item]);
      const completed = makeCompletedInvoice([item]);

      const { actions: baseActions } = makeActions(draft);
      const completeSpy = vi.fn(async () => ok(completed));
      const actions: InvoiceScreenActions = {
        ...baseActions,
        completeInvoice: { execute: completeSpy },
      };

      render(<CreateInvoiceScreen actions={actions} />);
      await screen.findByText("#000001");

      const completeButton = screen.getByRole("button", { name: "Hoàn thành" });
      fireEvent.click(completeButton);

      await waitFor(() => {
        expect(completeSpy).toHaveBeenCalled();
      });

      // Receipt preview modal should appear with "THU BA" branding
      expect(screen.getByRole("dialog", { name: "Xem trước phiếu in hóa đơn" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "THU BA" })).toBeVisible();
      expect(
        screen.getByText("Địa chỉ : 299 -đường 3/2 - Ô 1 - khu 2 - xã Chợ Gạo - Đồng Tháp"),
      ).toBeVisible();
      expect(screen.getByText("SĐT : 0989,601,556 - 0984,831,636")).toBeVisible();
    });

    it("resets checkout workspace to new draft when clicking 'Đóng & Tạo đơn mới' in receipt preview", async () => {
      const product = makeSingleUnitProduct();
      const item = makeInvoiceItem(ITEM_ID_1, product, product.units[0], 1, 29000);
      const completed = makeCompletedInvoice([item]);
      const freshDraft = makeDraftInvoice([]);

      const { actions: baseActions } = makeActions(completed);
      const createSpy = vi
        .fn()
        .mockResolvedValueOnce(ok(completed))
        .mockResolvedValueOnce(ok(freshDraft));
      const actions: InvoiceScreenActions = {
        ...baseActions,
        createInvoiceDraft: { execute: createSpy },
      };

      render(<CreateInvoiceScreen actions={actions} />);
      await screen.findByText("#000001");

      // Click "In hóa đơn" on completed invoice to open modal
      const printBtn = screen.getByRole("button", { name: "In hóa đơn" });
      fireEvent.click(printBtn);

      expect(screen.getByRole("dialog", { name: "Xem trước phiếu in hóa đơn" })).toBeVisible();

      // Click "Đóng & Tạo đơn mới"
      const newDraftBtn = screen.getByRole("button", { name: /Đóng & Tạo đơn mới/i });
      fireEvent.click(newDraftBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalled();
      });

      // Modal closed, back to new draft workspace
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Tạo hóa đơn mới")).toBeVisible();
    });
  });
});

describe("Invoice logic regressions", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("completion can be retried after a transient failure", async () => {
    const { actions: base } = populated();
    const actions = {
      ...base,
      completeInvoice: {
        execute: vi.fn(async () =>
          err({
            code: "persistence" as const,
            operation: "complete" as const,
            message: "temporarily locked",
          }),
        ),
      },
    };
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành" }));
    await screen.findByText("temporarily locked");
    expect(screen.getByRole("button", { name: "Hoàn thành" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành" }));
    await waitFor(() => expect(actions.completeInvoice.execute).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });
  it("completed overwrite is blocked while a visible row is invalid", async () => {
    const p = makeSingleUnitProduct();
    const invoice = makeCompletedInvoice([makeInvoiceItem(ITEM_ID_1, p, p.units[0])]);
    const { actions: base } = makeActions(invoice);
    const overwrite = vi.fn(async (input: { items: readonly InvoiceItem[] }) =>
      ok(invoice.overwriteCompleted(input.items, NOW)),
    );
    const actions = { ...base, overwriteCompletedInvoice: { execute: overwrite } };
    await ready(actions);
    fireEvent.blur(edit("Số lượng dòng 1", "2"));
    await screen.findByRole("button", { name: "Lưu ghi đè" });
    fireEvent.blur(edit("Số lượng dòng 1", "0"));
    expect(input("Số lượng dòng 1")).toHaveAttribute("data-dirty", "true");
    expect(screen.getByRole("button", { name: "Lưu ghi đè" })).toBeDisabled();
    expect(overwrite).not.toHaveBeenCalled();
    expect(input("Số lượng dòng 1")).toHaveValue(0);
  });
  it("cold start preserves persisted customer metadata during item edits", async () => {
    const p = makeSingleUnitProduct();
    const original = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, p, p.units[0])]).withCustomer(
      { name: "Persisted Customer", phone: "0901111222" },
      NOW,
    );
    const { actions, repository } = makeActions(original);
    await ready(actions);
    expect(input("Tên khách hàng")).toHaveValue("Persisted Customer");
    fireEvent.blur(edit("Số lượng dòng 1", "2"));
    await waitFor(() => expect(repository.saveDraftCalls).toHaveLength(1));
    expect(repository.saveDraftCalls[0].customerName).toBe("Persisted Customer");
  });
  it("customer-only completed edits are staged and can be discarded", async () => {
    const p = makeSingleUnitProduct();
    const original = makeCompletedInvoice([makeInvoiceItem(ITEM_ID_1, p, p.units[0])]);
    const { actions } = makeActions(original);
    await ready(actions);
    edit("Tên khách hàng", "Uncommitted Customer");
    expect(screen.getByRole("button", { name: "Lưu ghi đè" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "In hóa đơn" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Hủy thay đổi" })[0]);
    expect(input("Tên khách hàng")).toHaveValue("");
  });
  it("customer-only draft edits persist before switching invoices", async () => {
    const original = makeDraftInvoice().withCustomer(
      { name: "Old", address: "Existing address" },
      NOW,
    );
    const other = Invoice.createDraft({
      id: crypto.randomUUID(),
      invoiceNumber: 2,
      createdAt: NOW,
    });
    const { actions: base, repository } = makeActions(original);
    await repository.saveDraft(other);
    const actions = { ...base, listInvoices: { execute: () => repository.listInvoices("draft") } };
    await ready(actions);
    fireEvent.blur(edit("Tên khách hàng", "New"));
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.customerName).toBe("New"));
    expect(repository.saveDraftCalls.slice(-1)[0]?.customerAddress).toBe("Existing address");
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Mở bản nháp" }));
    await screen.findByText("#000002");
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Mở bản nháp" }));
    expect(input("Tên khách hàng")).toHaveValue("New");
  });
  it("failed draft deletion retains customer cache and displays an error", async () => {
    const original = makeDraftInvoice();
    const other = Invoice.createDraft({
      id: crypto.randomUUID(),
      invoiceNumber: 2,
      createdAt: NOW,
    });
    const key = `smart_invoice_customer_${other.id}`;
    localStorage.setItem(key, JSON.stringify({ name: "Unsynced Customer" }));
    const { actions: base } = makeActions(original);
    const actions = {
      ...base,
      listInvoices: { execute: vi.fn(async () => ok([original, other])) },
      deleteInvoiceDraft: {
        execute: vi.fn(async () =>
          err({
            code: "persistence" as const,
            operation: "delete_draft" as const,
            message: "locked",
          }),
        ),
      },
    };
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: /Bản nháp/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bản nháp #000002" }));
    await screen.findByText("Không thể xóa bản nháp. Vui lòng thử lại.");
    expect(localStorage.getItem(key)).toContain("Unsynced Customer");
    expect(screen.queryByText("Đã xóa bản nháp #000002")).toBeNull();
  });
  it("undo preserves the removed line note", async () => {
    const p = makeSingleUnitProduct();
    const original = makeDraftInvoice([
      makeInvoiceItem(ITEM_ID_1, p, p.units[0], 1, 29000, 0, "Already delivered"),
    ]);
    const { actions, repository } = makeActions(original);
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hoàn tác/ }));
    await waitFor(() => expect(repository.saveDraftCalls).toHaveLength(2));
    expect(repository.saveDraftCalls[1].items[0].note).toBe("Already delivered");
  });
  it("undo is cleared when creating another invoice", async () => {
    const { actions: base, repository } = populated();
    const actions = {
      ...base,
      createInvoiceDraft: { execute: vi.fn(base.createInvoiceDraft.execute) },
    };
    await ready(actions);
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    await screen.findByRole("button", { name: /Hoàn tác/ });
    const other = Invoice.createDraft({
      id: crypto.randomUUID(),
      invoiceNumber: 2,
      createdAt: NOW,
    });
    await repository.saveDraft(other);
    actions.createInvoiceDraft.execute.mockResolvedValueOnce(ok(other));
    fireEvent.click(screen.getByRole("button", { name: "Tạo mới" }));
    await screen.findByText("#000002");
    expect(screen.queryByRole("button", { name: /Hoàn tác/ })).toBeNull();
    expect(repository.saveDraftCalls.slice(-1)[0]?.items).toHaveLength(0);
  });
  it("filtering lines preserves the grand total", async () => {
    const p = makeSingleUnitProduct(),
      p2 = makeMultiUnitProduct();
    const original = makeDraftInvoice([
      makeInvoiceItem(ITEM_ID_1, p, p.units[0]),
      makeInvoiceItem(crypto.randomUUID(), p2, p2.units[0]),
    ]);
    const { actions } = makeActions(original);
    await ready(actions);
    expect(original.total).toBe(39000);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Cà phê" } });
    expect(screen.getByRole("complementary", { name: "Tổng quan hóa đơn" })).toHaveTextContent(
      "39.000 ₫",
    );
  });
  it("late saves cannot replace a different invoice selected from history", async () => {
    const { actions: base } = populated();
    let resolve!: (value: ReturnType<typeof ok<Invoice>>) => void;
    const pending = new Promise<ReturnType<typeof ok<Invoice>>>((r) => {
      resolve = r;
    });
    const actions = { ...base, applyInvoiceItemChange: { execute: vi.fn(() => pending) } };
    const view = render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");
    fireEvent.blur(edit("Số lượng dòng 1", "2"));
    await waitFor(() => expect(actions.applyInvoiceItemChange.execute).toHaveBeenCalled());
    const p = makeSingleUnitProduct();
    const old = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, p, p.units[0], 2)]);
    const id = crypto.randomUUID();
    const item = InvoiceItem.create({
      ...old.items[0].toState(),
      id: crypto.randomUUID(),
      invoiceId: id,
    });
    const other = Invoice.createDraft({ id, invoiceNumber: 99, createdAt: NOW })
      .replaceDraftItems([item], NOW)
      .complete(NOW);
    view.rerender(<CreateInvoiceScreen actions={actions} editingInvoice={other} />);
    await screen.findByText("#000099");
    await act(async () => {
      resolve(ok(old));
      await pending;
    });
    expect(screen.getByText("#000099")).toBeVisible();
  });
});

describe("Customer persistence ordering", () => {
  beforeEach(() => localStorage.clear());

  it("keeps a newer customer edit while an earlier item save finishes", async () => {
    const { actions, repository } = populated();
    const save = repository.saveDraft.bind(repository);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(repository, "saveDraft").mockImplementationOnce(async (value) => {
      await pending;
      return save(value);
    });
    await ready(actions);
    fireEvent.blur(edit("Số lượng dòng 1", "2"));
    await waitFor(() => expect(repository.saveDraft).toHaveBeenCalledTimes(1));
    fireEvent.blur(edit("Tên khách hàng", "New customer"));
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() =>
      expect(repository.saveDraftCalls.slice(-1)[0]?.customerName).toBe("New customer"),
    );
    expect(repository.saveDraftCalls.slice(-1)[0]?.items[0].quantity).toBe(2);
    expect(input("Tên khách hàng")).toHaveValue("New customer");
    expect(input("Số lượng dòng 1")).toHaveValue(2);
  });

  it("recovers customer input after a failed save and removes recovery cache only on success", async () => {
    const original = makeDraftInvoice().withCustomer({ name: "Original" }, NOW);
    const { actions, repository } = makeActions(original);
    const view = render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");
    repository.failNext("save_draft", "locked");
    fireEvent.blur(edit("Tên khách hàng", "Recovery customer"));
    await screen.findByText("Chưa lưu được thông tin khách hàng. Vui lòng thử lại.");
    expect(localStorage.getItem(`smart_invoice_customer_${original.id}`)).toContain(
      "Recovery customer",
    );
    view.unmount();
    await ready(actions);
    expect(input("Tên khách hàng")).toHaveValue("Recovery customer");
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin khách hàng" }));
    await waitFor(() =>
      expect(localStorage.getItem(`smart_invoice_customer_${original.id}`)).toBeNull(),
    );
    expect(await repository.findById(original.id)).toMatchObject({
      ok: true,
      value: { customerName: "Recovery customer" },
    });
  });

  it("clears all customer fields durably without reviving cached values", async () => {
    const original = makeDraftInvoice().withCustomer({ name: "Original" }, NOW);
    const { actions, repository } = makeActions(original);
    const view = render(<CreateInvoiceScreen actions={actions} />);
    await screen.findByText("#000001");
    fireEvent.blur(edit("Tên khách hàng", ""));
    await waitFor(() => expect(repository.saveDraftCalls.slice(-1)[0]?.customerName).toBeNull());
    view.unmount();
    const restored = await repository.findById(original.id);
    if (!restored.ok || !restored.value) throw new Error("Missing saved draft");
    await ready({ ...actions, createInvoiceDraft: { execute: async () => ok(restored.value!) } });
    expect(input("Tên khách hàng")).toHaveValue("");
  });

  it("retries a failed completed overwrite without requiring another edit", async () => {
    const product = makeSingleUnitProduct();
    const original = makeCompletedInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
    const { actions: base } = makeActions(original);
    let attempts = 0;
    const overwrite = vi.fn(async ({ items }: { items: readonly InvoiceItem[] }) => {
      attempts += 1;
      return attempts === 1
        ? err({
            code: "persistence" as const,
            operation: "overwrite_completed" as const,
            message: "locked",
          })
        : ok(original.overwriteCompleted(items, NOW));
    });
    await ready({ ...base, overwriteCompletedInvoice: { execute: overwrite } });
    fireEvent.blur(edit("Số lượng dòng 1", "2"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu ghi đè" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi đè" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận ghi đè" }));
    await screen.findByText("Không thể ghi đè hóa đơn đã chốt.");
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi đè" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận ghi đè" }));
    await waitFor(() => expect(overwrite).toHaveBeenCalledTimes(2));
    await screen.findByText("Đã cập nhật hóa đơn đã chốt #000001");
  });
});

it("records printing from the invoice editor only after success confirmation", async () => {
  localStorage.clear();
  const product = makeSingleUnitProduct();
  const original = makeCompletedInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
  const { actions: base } = makeActions(original);
  const mark = vi.fn(async () => ok(undefined));
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  await ready({ ...base, markInvoicePrinted: { execute: mark } });
  fireEvent.click(screen.getByRole("button", { name: "In hóa đơn" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /In hóa đơn/ }));
  expect(mark).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Đã in thành công" }));
  await waitFor(() =>
    expect(mark).toHaveBeenCalledWith({ invoiceId: original.id, printedAt: expect.any(String) }),
  );
  expect(print).toHaveBeenCalledTimes(1);
  print.mockRestore();
});

describe("Issue 49 old debt", () => {
  function invoice() {
    const product = makeSingleUnitProduct();
    return makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
  }
  it("saves numeric debt on blur, formats it, and includes it in completed receipt", async () => {
    const { actions, repository } = makeActions(invoice());
    await ready({
      ...actions,
      completeInvoice: new CompleteInvoice(repository, { now: () => NOW }),
    });
    const input = screen.getByLabelText("Nợ cũ (₫)");
    expect(input).toHaveValue("");
    fireEvent.focus(input);
    expect(input).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(input, { target: { value: "125000" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("125.000");
    await waitFor(async () =>
      expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 125000 } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));
    await screen.findByRole("dialog");
    expect(screen.getByText("Cũ")).toBeVisible();
    expect(document.querySelector(".receipt-final-total-row .td-payment")).toHaveTextContent(
      "154.000",
    );
  });
  it("blocks negative or fractional debt and treats an empty input as zero", async () => {
    const { actions, repository } = makeActions(invoice());
    await ready({
      ...actions,
      completeInvoice: new CompleteInvoice(repository, { now: () => NOW }),
    });
    const input = screen.getByLabelText("Nợ cũ (₫)");
    fireEvent.focus(input);
    for (const value of ["-1", "0.5", "9007199254740992"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("button", { name: /Hoàn thành/ })).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByRole("button", { name: /Hoàn thành/ })).toBeEnabled());
    expect(input).toHaveValue("");
    expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 0 } });
  });
  it("retains debt input after a failed save and allows retry", async () => {
    const { actions, repository } = makeActions(invoice());
    await ready(actions);
    repository.failNext("save_draft", "locked");
    const input = screen.getByLabelText("Nợ cũ (₫)");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50000" } });
    fireEvent.blur(input);
    await screen.findByText("Chưa lưu được nợ cũ. Vui lòng thử lại.");
    expect(input).toHaveValue("50.000");
    expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu nợ cũ" }));
    await waitFor(async () =>
      expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 50000 } }),
    );
  });
  it("stages completed debt edits, supports discard, and requires confirmed overwrite", async () => {
    const completed = invoice().withOldDebt(50000, NOW).complete(NOW);
    const { actions, repository } = makeActions(completed);
    render(
      <CreateInvoiceScreen
        actions={{
          ...actions,
          overwriteCompletedInvoice: new OverwriteCompletedInvoice(repository, { now: () => NOW }),
        }}
        editingInvoice={completed}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("Nợ cũ (₫)")).toHaveValue("50.000"));
    const input = screen.getByLabelText("Nợ cũ (₫)");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "25000" } });
    fireEvent.blur(input);
    expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 50000 } });
    fireEvent.click(screen.getAllByRole("button", { name: "Hủy thay đổi" })[0]);
    expect(input).toHaveValue("50.000");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "25000" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi đè" }));
    expect(await repository.findById(INVOICE_ID)).toMatchObject({ value: { oldDebt: 50000 } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận ghi đè" }));
    await waitFor(async () =>
      expect(await repository.findById(INVOICE_ID)).toMatchObject({
        value: { oldDebt: 25000, status: "completed" },
      }),
    );
  });
});

it("keeps a successful queued item save and flags debt that now exceeds the combined limit", async () => {
  const product = makeSingleUnitProduct();
  const initial = makeDraftInvoice([makeInvoiceItem(ITEM_ID_1, product, product.units[0])]);
  const { actions, repository } = makeActions(initial);
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  const itemAction = actions.applyInvoiceItemChange;
  await ready({
    ...actions,
    applyInvoiceItemChange: {
      execute: async (input) => {
        await delay;
        return itemAction.execute(input);
      },
    },
    completeInvoice: new CompleteInvoice(repository, { now: () => NOW }),
  });
  const price = screen.getByLabelText("Đơn giá dòng 1");
  fireEvent.change(price, { target: { value: String(Number.MAX_SAFE_INTEGER) } });
  fireEvent.blur(price);
  const debt = screen.getByLabelText("Nợ cũ (₫)");
  fireEvent.focus(debt);
  fireEvent.change(debt, { target: { value: "1000" } });
  await act(async () => {
    release();
  });
  await screen.findByText("Nợ cũ và tổng tiền vượt giới hạn hợp lệ. Hãy kiểm tra lại.");
  expect(await repository.findById(INVOICE_ID)).toMatchObject({
    value: { total: Number.MAX_SAFE_INTEGER },
  });
  expect(price).toHaveAttribute("data-dirty", "false");
  expect(screen.getByRole("button", { name: /Hoàn thành/ })).toBeDisabled();
});
