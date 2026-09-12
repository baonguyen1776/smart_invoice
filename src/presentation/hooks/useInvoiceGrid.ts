import { useRef, useState } from "react";
import type { InvoiceItemChange } from "../../application/use-cases/ApplyInvoiceItemChange";
import type { InvoiceItem, UpdateInvoiceItemInput } from "../../domain/entities/InvoiceItem";
import type { Product } from "../../domain/entities/Product";
import {
  calculateInvoiceLineAmounts,
  parseDiscountPercent,
  type InvoiceLineAmounts,
} from "../../domain/rules/CalculateInvoiceAmounts";

type Selection = NonNullable<UpdateInvoiceItemInput["selection"]>;
export interface InvoiceRowValues {
  readonly name: string;
  readonly selection: Selection | null;
  readonly product?: Product;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly note: string;
}
export interface InvoiceRowDraft {
  readonly values: InvoiceRowValues;
  readonly revision: number;
  readonly error?: string;
}
const EMPTY_VALUES: InvoiceRowValues = {
  name: "",
  selection: null,
  quantity: "",
  unitPrice: "",
  discount: "",
  note: "",
};

export function invoiceRowValues(item?: InvoiceItem): InvoiceRowValues {
  if (!item) return EMPTY_VALUES;
  return {
    name: item.productName,
    selection: {
      productId: item.productId,
      unitId: item.unitId,
      productName: item.productName,
      productSku: item.productSku,
      productBrand: item.productBrand,
      unitName: item.unitName,
    },
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
    discount: String(item.discountBasisPoints / 100),
    note: item.note ?? "",
  };
}

function rowInput(values: InvoiceRowValues) {
  if (!values.selection || values.name !== values.selection.productName)
    throw new Error("Chọn hàng hóa từ danh mục.");
  if (!/^-?\d+$/.test(values.quantity) || Number(values.quantity) === 0)
    throw new Error("Số lượng phải là số nguyên khác 0.");
  if (!/^\d+$/.test(values.unitPrice))
    throw new Error("Đơn giá phải là số nguyên VND từ 0 trở lên.");
  const quantity = Number(values.quantity);
  const unitPrice = Number(values.unitPrice);
  const discountBasisPoints = parseDiscountPercent(values.discount || "0");
  try {
    calculateInvoiceLineAmounts(quantity, unitPrice, discountBasisPoints);
  } catch {
    throw new Error("Giá trị hoặc thành tiền vượt giới hạn hợp lệ.");
  }
  const note = values.note.trim() ? values.note.trim() : null;
  return { ...values.selection, quantity, unitPrice, discountBasisPoints, note };
}

export function previewInvoiceRow(values: InvoiceRowValues): InvoiceLineAmounts | null {
  try {
    const input = rowInput(values);
    return calculateInvoiceLineAmounts(input.quantity, input.unitPrice, input.discountBasisPoints);
  } catch {
    return null;
  }
}

interface UseInvoiceGridInput {
  readonly items: readonly InvoiceItem[];
  readonly onCommit: (change: InvoiceItemChange) => Promise<string | null>;
  readonly onRemove: (itemId: string) => Promise<string | null>;
}

export function useInvoiceGrid({ items, onCommit, onRemove }: UseInvoiceGridInput) {
  const [order, setOrder] = useState<string[]>(() => [
    ...items.map((item) => item.id),
    crypto.randomUUID(),
  ]);
  const [drafts, setDrafts] = useState<Record<string, InvoiceRowDraft>>({});
  const draftRef = useRef(drafts);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const savedIds = useRef(new Set(items.map((item) => item.id)));
  const queues = useRef(new Map<string, Promise<void>>());
  const submitted = useRef(new Map<string, number>());
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const signature = items.map((item) => item.id).join(",");
  const [previousSignature, setPreviousSignature] = useState(signature);
  if (signature !== previousSignature) {
    setPreviousSignature(signature);
    const itemIds = new Set(items.map((item) => item.id));
    const missing = items.filter((item) => !order.includes(item.id)).map((item) => item.id);
    setOrder((current) => {
      const trailing = current[current.length - 1];
      const retained = current.slice(0, -1).filter((id) => itemIds.has(id));
      return [...retained, ...missing, trailing];
    });
  }

  function putDraft(id: string, draft?: InvoiceRowDraft) {
    const next = { ...draftRef.current };
    if (draft) next[id] = draft;
    else delete next[id];
    draftRef.current = next;
    setDrafts(next);
  }
  function change(id: string, values: InvoiceRowValues) {
    const revision = (draftRef.current[id]?.revision ?? 0) + 1;
    putDraft(id, { values, revision });
    setOrder((current) =>
      (values.name || values.quantity || values.unitPrice || values.discount || values.note) &&
      current[current.length - 1] === id
        ? [...current, crypto.randomUUID()]
        : current,
    );
  }
  function reset(id: string) {
    if (saving.has(id)) return;
    putDraft(id);
    submitted.current.delete(id);
    if (!itemMap.has(id))
      setOrder((current) =>
        current.filter((key) => key !== id || key === current[current.length - 1]),
      );
  }
  function commit(id: string) {
    const draft = draftRef.current[id];
    if (!draft || submitted.current.get(id) === draft.revision) return;
    let input: ReturnType<typeof rowInput>;
    try {
      input = rowInput(draft.values);
    } catch (error) {
      putDraft(id, {
        ...draft,
        error: error instanceof Error ? error.message : "Dòng chưa hợp lệ.",
      });
      return;
    }
    submitted.current.set(id, draft.revision);
    setSaving((current) => new Set(current).add(id));
    const operation = (queues.current.get(id) ?? Promise.resolve()).then(async () => {
      let failure: string | null;
      try {
        failure = await onCommit(
          savedIds.current.has(id) || itemMap.has(id)
            ? {
                type: "update",
                itemId: id,
                values: {
                  quantity: input.quantity,
                  unitPrice: input.unitPrice,
                  discountBasisPoints: input.discountBasisPoints,
                  note: input.note,
                  selection: draft.values.selection!,
                },
              }
            : { type: "add", itemId: id, ...input },
        );
      } catch {
        failure = "Chưa lưu được dòng. Hãy thử lại.";
      }
      if (!failure) savedIds.current.add(id);
      if (draftRef.current[id]?.revision === draft.revision) {
        if (failure) {
          submitted.current.delete(id);
          putDraft(id, { ...draft, error: failure });
        } else {
          submitted.current.delete(id);
          putDraft(id);
        }
      }
    });
    queues.current.set(id, operation);
    void operation.finally(() => {
      if (queues.current.get(id) === operation) {
        queues.current.delete(id);
        setSaving((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    });
  }
  async function remove(id: string) {
    if (queues.current.has(id)) return;
    if (savedIds.current.has(id) || itemMap.has(id)) {
      const failure = await onRemove(id);
      if (failure) return;
    }
    savedIds.current.delete(id);
    putDraft(id);
    submitted.current.delete(id);
    setOrder((current) => {
      const next = current.filter((key) => key !== id);
      return next.length ? next : [crypto.randomUUID()];
    });
  }
  return {
    rows: order.map((id, index) => ({
      id,
      number: index + 1,
      values: drafts[id]?.values ?? invoiceRowValues(itemMap.get(id)),
      isDirty: Boolean(drafts[id]),
      isSaving: saving.has(id),
      error: drafts[id]?.error,
      isTrailing: index === order.length - 1,
    })),
    change,
    commit,
    reset,
    remove,
  };
}
