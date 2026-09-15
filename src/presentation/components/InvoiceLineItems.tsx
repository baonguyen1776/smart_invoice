import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { sumInvoiceAmountsExact } from "../../domain/rules/CalculateInvoiceAmounts";
import { formatInvoiceAmount } from "../formatters/FormatInvoiceAmount";
import type { InvoiceItem } from "../../domain/entities/InvoiceItem";
import type { InvoiceItemChange } from "../../application/use-cases/ApplyInvoiceItemChange";
import type { SearchProducts } from "../../application/use-cases/SearchProducts";
import { previewInvoiceRow, useInvoiceGrid, type InvoiceRowValues } from "../hooks/useInvoiceGrid";
import { InvoiceIcon } from "./InvoiceIcon";
import { InvoiceProductCell } from "./InvoiceProductCell";
import "./InvoiceLineItems.css";

interface InvoiceLineItemsProps {
  readonly items: readonly InvoiceItem[];
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly onCommit: (change: InvoiceItemChange) => Promise<string | null>;
  readonly onRemove: (itemId: string) => Promise<string | null>;
  readonly searchProducts: Pick<SearchProducts, "execute">;
  readonly onNavigateToProducts?: (query: string) => void;
  readonly onOpenDrafts?: () => void;
  readonly draftsCount?: number;
  readonly isDraftsOpen?: boolean;
  readonly onPendingInputChange?: (pending: boolean) => void;
}
const COLUMNS = [
  ["name", "Tên hàng hóa"],
  ["unitName", "Đvt"],
  ["quantity", "Số lượng"],
  ["unitPrice", "Đơn giá"],
  ["subtotal", "Thành tiền"],
  ["discount", "CK (%)"],
  ["discountAmount", "Tiền CK"],
  ["payment", "Thanh toán"],
] as const;
type SortColumn = (typeof COLUMNS)[number][0];

function sortValue(values: InvoiceRowValues, column: SortColumn): string | number {
  if (column === "name") return values.name;
  if (column === "unitName") return values.selection?.unitName ?? "";
  if (column === "quantity" || column === "unitPrice" || column === "discount")
    return Number(values[column].replace(",", "."));
  return previewInvoiceRow(values)?.[column] ?? 0;
}
function moveCell(event: KeyboardEvent<HTMLTableElement>) {
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (event.key !== "Enter" && event.key !== "Tab") return;
  const fields = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[data-grid-cell="true"]'),
  );
  const index = fields.indexOf(event.target as HTMLElement);
  if (index < 0) return;
  const next = fields[index + (event.shiftKey ? -1 : 1)];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

export function InvoiceLineItems(props: InvoiceLineItemsProps) {
  const grid = useInvoiceGrid(props);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousRows = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    const ids = new Set(grid.rows.map((row) => row.id));
    const previous = previousRows.current;
    previousRows.current = props.isReady && !props.isLoading ? ids : null;
    if (!previous || !props.isReady || props.isLoading) return;
    const addedRows = grid.rows.filter((row) => !previous.has(row.id));
    const added = addedRows[addedRows.length - 1];
    const container = scrollRef.current;
    if (!added || !container) return;
    const row = container.querySelector<HTMLElement>(`[data-row-id="${added.id}"]`);
    if (!row) return;
    const bounds = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const headerHeight = container.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const footerHeight = container.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    if (rowBounds.bottom > bounds.bottom - footerHeight)
      container.scrollTop += rowBounds.bottom - bounds.bottom + footerHeight;
    else if (rowBounds.top < bounds.top + headerHeight)
      container.scrollTop += rowBounds.top - bounds.top - headerHeight;
  }, [grid.rows, props.isReady, props.isLoading]);
  const onPendingInputChange = props.onPendingInputChange;
  useEffect(() => {
    onPendingInputChange?.(grid.hasPendingInput);
  }, [grid.hasPendingInput, onPendingInputChange]);
  const [filter, setFilter] = useState("");
  const [activeNoteRowIds, setActiveNoteRowIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: "ascending" | "descending";
  } | null>(null);

  const toggleNoteRow = (rowId: string) => {
    setActiveNoteRowIds((prev) => {
      const next = new Set(prev);
      const row = rows.find((r) => r.id === rowId);
      const hasExistingNote = Boolean(row?.values.note);

      if (next.has(rowId) && !hasExistingNote) {
        next.delete(rowId);
      } else {
        next.add(rowId);
        setTimeout(() => {
          const el = document.getElementById(`note-input-${rowId}`) as HTMLInputElement | null;
          el?.focus();
          el?.select();
        }, 0);
      }
      return next;
    });
  };
  const needle = filter.trim().toLocaleLowerCase("vi");
  const rows = grid.rows.filter(
    (row) =>
      row.isTrailing ||
      row.isDirty ||
      [
        row.values.name,
        row.values.selection?.productSku,
        row.values.selection?.unitName,
        row.values.note,
      ].some((value) => value?.toLocaleLowerCase("vi").includes(needle)),
  );
  if (sort)
    rows.sort((a, b) => {
      if (a.isTrailing || b.isTrailing) return a.isTrailing ? 1 : -1;
      const left = sortValue(a.values, sort.column),
        right = sortValue(b.values, sort.column);
      const order =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, "vi", { numeric: true })
          : Number(left) - Number(right);
      return sort.direction === "ascending" ? order : -order;
    });
  const money = (value?: number | bigint) => {
    if (value === undefined) return "-";
    return formatInvoiceAmount(value);
  };

  const {
    subtotal: totalSubtotal,
    discountAmount: totalDiscount,
    payment: totalPayment,
  } = sumInvoiceAmountsExact(
    grid.rows.flatMap((row) => {
      const preview = previewInvoiceRow(row.values);
      return preview ? [preview] : [];
    }),
  );

  return (
    <section
      className="invoice-table-card invoice-grid-card"
      aria-labelledby="invoice-items-heading"
    >
      <div className="invoice-table-toolbar">
        <div className="invoice-section-title">
          <h2 id="invoice-items-heading">Chi tiết hóa đơn</h2>
          <span className="invoice-count">{props.items.length}</span>
        </div>
        <div className="invoice-toolbar-actions">
          <label className="invoice-line-filter">
            <span className="sr-only">Lọc dòng hóa đơn</span>
            <InvoiceIcon name="search" size={16} />
            <input
              type="search"
              placeholder="Lọc hàng hóa…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          {props.onOpenDrafts && (
            <button
              type="button"
              className={`btn-drafts-badge ${props.isDraftsOpen ? "is-active" : ""}`}
              onClick={props.onOpenDrafts}
              aria-label={`Bản nháp (${props.draftsCount ?? 0})`}
              title="Xem danh sách bản nháp đã lưu để mở lại"
            >
              <InvoiceIcon name="receipt" size={13} />
              Bản nháp
              {(props.draftsCount ?? 0) > 0 && (
                <span className="drafts-count">{props.draftsCount}</span>
              )}
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="invoice-table-container invoice-grid-scroll"
        role="region"
        aria-label="Chi tiết hóa đơn"
        tabIndex={0}
        aria-busy={props.isLoading}
      >
        <table
          className="invoice-table invoice-grid"
          aria-label="Chi tiết hóa đơn"
          onKeyDown={moveCell}
        >
          <colgroup>
            {[
              "number",
              "name",
              "unit",
              "quantity",
              "price",
              "subtotal",
              "discount",
              "discount-amount",
              "payment",
              "delete",
            ].map((name, index) => (
              <col key={index} className={`grid-col-${name}`} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Stt</th>
              {COLUMNS.map(([key, label]) => (
                <th
                  scope="col"
                  key={key}
                  aria-sort={sort?.column === key ? sort.direction : "none"}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((current) =>
                        current?.column === key
                          ? current.direction === "ascending"
                            ? { column: key, direction: "descending" }
                            : null
                          : { column: key, direction: "ascending" },
                      )
                    }
                  >
                    {label}
                    <InvoiceIcon name="sort" size={11} />
                  </button>
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Xóa dòng</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {props.isLoading ? (
              <tr aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => (
                  <td key={index}>
                    <span className="invoice-skeleton" />
                  </td>
                ))}
              </tr>
            ) : (
              props.isReady &&
              rows.map((row) => {
                const { values } = row;
                const preview = previewInvoiceRow(values);
                const lookup =
                  values.selection && !values.product
                    ? props.searchProducts.execute({
                        query: values.selection.productId,
                        limit: 1,
                        exactIdOnly: true,
                      })
                    : null;
                const product =
                  values.product ??
                  (lookup?.ok
                    ? lookup.value.find(
                        (candidate) => candidate.product.id === values.selection?.productId,
                      )?.product
                    : undefined);
                const units = product?.units.filter((unit) => unit.isActive) ?? [];
                const numericInput = (
                  field: "quantity" | "unitPrice" | "discount",
                  label: string,
                ) => (
                  <input
                    className="invoice-grid-input invoice-grid-number"
                    data-grid-cell="true"
                    data-dirty={row.isDirty}
                    aria-label={`${label} dòng ${row.number}`}
                    aria-invalid={Boolean(row.error)}
                    type={field === "discount" ? "text" : "number"}
                    inputMode={
                      field === "discount" ? "decimal" : field === "quantity" ? "text" : "numeric"
                    }
                    min={field === "quantity" ? -Number.MAX_SAFE_INTEGER : 0}
                    max={field === "discount" ? 100 : Number.MAX_SAFE_INTEGER}
                    step={field === "discount" ? undefined : 1}
                    placeholder="-"
                    value={values[field]}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      grid.change(row.id, { ...values, [field]: event.target.value })
                    }
                    onBlur={() => grid.commit(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") grid.reset(row.id);
                    }}
                  />
                );
                const hasInlineNote =
                  (Boolean(values.note) || activeNoteRowIds.has(row.id)) && !row.isTrailing;
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    aria-busy={row.isSaving}
                    className={row.isTrailing ? "invoice-grid-blank" : ""}
                  >
                    <td className="grid-row-number">{row.number}</td>
                    <td className={`grid-cell-product ${hasInlineNote ? "has-inline-note" : ""}`}>
                      <div className="product-cell-wrapper">
                        <InvoiceProductCell
                          value={values.name}
                          label={`Tên hàng hóa dòng ${row.number}`}
                          isDirty={row.isDirty}
                          error={row.error}
                          searchProducts={props.searchProducts}
                          onNavigateToProducts={props.onNavigateToProducts}
                          onChange={(name) =>
                            grid.change(row.id, {
                              ...values,
                              name,
                              selection: null,
                              product: undefined,
                            })
                          }
                          onBlur={() => grid.commit(row.id)}
                          onSelect={(selected) => {
                            const unit = selected.units.find((entry) => entry.isActive);
                            if (!unit) return;
                            grid.change(row.id, {
                              ...values,
                              name: selected.name,
                              product: selected,
                              selection: {
                                productId: selected.id,
                                productName: selected.name,
                                productSku: selected.sku,
                                productBrand: selected.brand,
                                unitId: unit.id,
                                unitName: unit.name,
                              },
                              quantity: values.quantity || "1",
                              unitPrice: props.items.some((item) => item.id === row.id)
                                ? String(unit.price)
                                : values.unitPrice || String(unit.price),
                              discount: values.discount || "0",
                            });
                            grid.commit(row.id);
                          }}
                        />
                        {hasInlineNote && (
                          <div className="product-inline-note-wrapper">
                            <InvoiceIcon name="note" size={11} style={{ flexShrink: 0 }} />
                            <input
                              id={`note-input-${row.id}`}
                              className="product-inline-note-input"
                              data-dirty={row.isDirty}
                              aria-label={`Nội dung ghi chú dòng ${row.number}`}
                              placeholder="Ghi chú dòng (VD: Giao trước 5 cuốn...)"
                              value={values.note}
                              onChange={(event) =>
                                grid.change(row.id, { ...values, note: event.target.value })
                              }
                              onBlur={() => {
                                grid.commit(row.id);
                                if (!values.note.trim()) {
                                  setActiveNoteRowIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(row.id);
                                    return next;
                                  });
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  grid.reset(row.id);
                                  if (!values.note.trim()) {
                                    setActiveNoteRowIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(row.id);
                                      return next;
                                    });
                                  }
                                }
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  grid.commit(row.id);
                                  if (!values.note.trim()) {
                                    setActiveNoteRowIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(row.id);
                                      return next;
                                    });
                                  }
                                }
                              }}
                            />
                            {values.note && (
                              <button
                                type="button"
                                className="btn-clear-inline-note"
                                title="Xóa ghi chú này"
                                aria-label={`Xóa ghi chú dòng ${row.number}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  grid.change(row.id, { ...values, note: "" });
                                  grid.commit(row.id);
                                  setActiveNoteRowIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(row.id);
                                    return next;
                                  });
                                }}
                              >
                                <InvoiceIcon name="close" size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="invoice-grid-input"
                        data-grid-cell="true"
                        data-dirty={row.isDirty}
                        aria-label={`Đvt dòng ${row.number}`}
                        value={values.selection?.unitId ?? ""}
                        onChange={(event) => {
                          const unit = units.find((entry) => entry.id === event.target.value);
                          if (!unit || !values.selection) return;
                          grid.change(row.id, {
                            ...values,
                            product,
                            selection: {
                              ...values.selection,
                              unitId: unit.id,
                              unitName: unit.name,
                            },
                            unitPrice: String(unit.price),
                          });
                          grid.commit(row.id);
                        }}
                      >
                        {!values.selection && <option value="">-</option>}
                        {values.selection &&
                          !units.some((unit) => unit.id === values.selection?.unitId) && (
                            <option value={values.selection.unitId}>
                              {values.selection.unitName}
                            </option>
                          )}
                        {units.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{numericInput("quantity", "Số lượng")}</td>
                    <td>{numericInput("unitPrice", "Đơn giá")}</td>
                    <td className="grid-amount">
                      <span>{money(preview?.subtotal)}</span>
                    </td>
                    <td>{numericInput("discount", "CK (%)")}</td>
                    <td className="grid-amount">
                      <span>{money(preview?.discountAmount)}</span>
                    </td>
                    <td className="grid-amount grid-payment">
                      <span>{money(preview?.payment)}</span>
                    </td>
                    <td className="grid-row-actions">
                      {!row.isTrailing && (
                        <div className="row-action-buttons">
                          <button
                            type="button"
                            className={`btn-row-action btn-note-row ${values.note ? "has-note" : ""}`}
                            aria-label={
                              values.note
                                ? `Sửa ghi chú dòng ${row.number}`
                                : `Thêm ghi chú dòng ${row.number}`
                            }
                            title={values.note ? `Ghi chú: ${values.note}` : "Thêm ghi chú dòng"}
                            onClick={() => toggleNoteRow(row.id)}
                          >
                            <InvoiceIcon name="note" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-row-action btn-delete-row"
                            aria-label={`Xóa dòng ${row.number}`}
                            disabled={row.isSaving}
                            onClick={() => void grid.remove(row.id)}
                          >
                            <InvoiceIcon name="trash" size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="invoice-grid-total-row">
              <td colSpan={5} className="grid-total-label">
                Tổng Cộng
              </td>
              <td className="grid-amount">
                <span>{totalSubtotal !== 0n ? formatInvoiceAmount(totalSubtotal) : "-"}</span>
              </td>
              <td className="grid-total-empty"></td>
              <td className="grid-amount">
                <span>{totalDiscount !== 0n ? formatInvoiceAmount(totalDiscount) : "-"}</span>
              </td>
              <td
                className="grid-amount grid-payment"
                role="complementary"
                aria-label="Tổng quan hóa đơn"
              >
                <span>
                  {totalPayment !== 0n
                    ? totalPayment < 0
                      ? `(${(-totalPayment).toLocaleString("vi-VN")} ₫)`
                      : `${totalPayment.toLocaleString("vi-VN")} ₫`
                    : "-"}
                </span>
              </td>
              <td className="grid-total-empty"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
