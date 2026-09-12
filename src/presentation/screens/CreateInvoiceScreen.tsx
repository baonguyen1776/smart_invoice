import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplyInvoiceItemChange,
  InvoiceItemChange,
} from "../../application/use-cases/ApplyInvoiceItemChange";
import type { CompleteInvoice } from "../../application/use-cases/CompleteInvoice";
import type { CreateInvoiceDraft } from "../../application/use-cases/CreateInvoiceDraft";
import type { DeleteInvoiceDraft } from "../../application/use-cases/DeleteInvoiceDraft";
import type { ListInvoices } from "../../application/use-cases/ListInvoices";
import type { OverwriteCompletedInvoice } from "../../application/use-cases/OverwriteCompletedInvoice";
import type { RestoreInvoiceDraft } from "../../application/use-cases/RestoreInvoiceDraft";
import type { SearchProducts } from "../../application/use-cases/SearchProducts";
import type { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InvoiceIcon } from "../components/InvoiceIcon";
import { InvoiceLineItems } from "../components/InvoiceLineItems";
import { InvoiceReceiptPreviewModal } from "../components/InvoiceReceiptPreviewModal";
import "./CreateInvoiceScreen.css";

export interface InvoiceScreenActions {
  readonly createInvoiceDraft: Pick<CreateInvoiceDraft, "execute">;
  readonly restoreInvoiceDraft?: Pick<RestoreInvoiceDraft, "execute">;
  readonly applyInvoiceItemChange: Pick<ApplyInvoiceItemChange, "execute">;
  readonly searchProducts: Pick<SearchProducts, "execute">;
  readonly listInvoices?: Pick<ListInvoices, "execute">;
  readonly deleteInvoiceDraft?: Pick<DeleteInvoiceDraft, "execute">;
  readonly completeInvoice?: Pick<CompleteInvoice, "execute">;
  readonly overwriteCompletedInvoice?: Pick<OverwriteCompletedInvoice, "execute">;
}

function applyItemChangeInMemory(
  items: readonly InvoiceItem[],
  invoiceId: string,
  change: InvoiceItemChange,
  now: string,
): readonly InvoiceItem[] {
  if (change.type === "add") {
    return [
      ...items,
      InvoiceItem.create({
        id: change.itemId ?? crypto.randomUUID(),
        discountBasisPoints: change.discountBasisPoints,
        invoiceId,
        productId: change.productId,
        unitId: change.unitId,
        productName: change.productName,
        productSku: change.productSku,
        productBrand: change.productBrand,
        unitName: change.unitName,
        unitPrice: change.unitPrice,
        quantity: change.quantity,
        note: change.note,
        createdAt: now,
      }),
    ];
  }

  const index = items.findIndex((item) => item.id === change.itemId);
  if (index < 0) return items;

  if (change.type === "remove") {
    return items.filter((_, itemIndex) => itemIndex !== index);
  }

  return items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    if (change.type === "update") return item.update(change.values);
    return change.type === "update_quantity"
      ? item.update({ quantity: change.quantity })
      : item.update({ unitPrice: change.unitPrice });
  });
}

export interface CreateInvoiceScreenProps {
  readonly actions: InvoiceScreenActions;
  readonly onNavigateToProducts?: (prefillQuery?: string) => void;
  readonly onNavigate?: (screen: "invoice" | "products") => void;
  readonly activeScreen?: "invoice" | "products";
  readonly onCompleteInvoice?: (invoice: Invoice) => void;
}

export function CreateInvoiceScreen({
  actions,
  onNavigateToProducts,
  onNavigate,
  activeScreen = "invoice",
  onCompleteInvoice,
}: CreateInvoiceScreenProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [lastRemoved, setLastRemoved] = useState<InvoiceItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [drafts, setDrafts] = useState<readonly Invoice[]>([]);
  const [completedInvoices, setCompletedInvoices] = useState<readonly Invoice[]>([]);
  const [invoicesTab, setInvoicesTab] = useState<"drafts" | "completed">("drafts");
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [originalCompletedInvoice, setOriginalCompletedInvoice] = useState<Invoice | null>(null);
  const [hasStagedChanges, setHasStagedChanges] = useState(false);
  const [isConfirmOverwriteOpen, setIsConfirmOverwriteOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const changeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const selectionPending = useRef(false);
  const isSaving = pendingChanges > 0 || isOverwriting;

  const [loadAttempt, setLoadAttempt] = useState(0);
  const draftRequest = useRef<{
    action:
      InvoiceScreenActions["createInvoiceDraft"] | InvoiceScreenActions["restoreInvoiceDraft"];
    attempt: number;
    promise: ReturnType<InvoiceScreenActions["createInvoiceDraft"]["execute"]>;
  } | null>(null);

  const loadCustomerForInvoice = useCallback((invoiceId: string) => {
    try {
      localStorage.setItem("smart_invoice_active_draft_id", invoiceId);
      const saved = localStorage.getItem(`smart_invoice_customer_${invoiceId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCustomerName(parsed.name || "");
        setCustomerPhone(parsed.phone || "");
        setCustomerNote(parsed.note || "");
        return;
      }
    } catch {
      // ignore
    }
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNote("");
  }, []);

  const refreshInvoices = useCallback(async () => {
    if (!actions.listInvoices) return;
    try {
      const draftsResult = await actions.listInvoices.execute({ status: "draft" });
      if (draftsResult.ok) {
        setDrafts(draftsResult.value);
      }
      const completedResult = await actions.listInvoices.execute({ status: "completed" });
      if (completedResult.ok) {
        setCompletedInvoices(completedResult.value);
      }
    } catch {
      // ignore
    }
  }, [actions.listInvoices]);

  useEffect(() => {
    let isCancelled = false;
    const activeAction = actions.restoreInvoiceDraft ?? actions.createInvoiceDraft;

    // Reuse the in-flight request during StrictMode's effect replay.
    if (
      draftRequest.current?.action !== activeAction ||
      draftRequest.current.attempt !== loadAttempt
    ) {
      const preferredId = (() => {
        try {
          return localStorage.getItem("smart_invoice_active_draft_id") || undefined;
        } catch {
          return undefined;
        }
      })();

      const promise = actions.restoreInvoiceDraft
        ? actions.restoreInvoiceDraft.execute({ preferredInvoiceId: preferredId })
        : actions.createInvoiceDraft.execute();

      draftRequest.current = {
        action: activeAction,
        attempt: loadAttempt,
        promise,
      };
    }
    const request = draftRequest.current.promise;
    async function initializeDraft() {
      try {
        const result = await request;
        if (isCancelled) return;
        if (result.ok) {
          setInvoice(result.value);
          if (result.value.status === "completed") {
            setOriginalCompletedInvoice(result.value);
          }
          loadCustomerForInvoice(result.value.id);
          void refreshInvoices();
        } else {
          setErrorMessage("Không thể mở hóa đơn nháp. Vui lòng thử lại.");
        }
      } catch {
        if (!isCancelled) setErrorMessage("Không thể mở hóa đơn nháp. Vui lòng thử lại.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void initializeDraft();
    return () => {
      isCancelled = true;
    };
  }, [
    actions.createInvoiceDraft,
    actions.restoreInvoiceDraft,
    loadAttempt,
    loadCustomerForInvoice,
    refreshInvoices,
  ]);

  useEffect(() => {
    if (!isLoading)
      document.querySelector<HTMLInputElement>('[data-product-input="true"]')?.focus();
  }, [isLoading]);

  useEffect(() => {
    if (lastRemoved) undoButtonRef.current?.focus();
  }, [lastRemoved]);

  function handleCustomerChange(field: "name" | "phone" | "note", value: string) {
    const nextName = field === "name" ? value : customerName;
    const nextPhone = field === "phone" ? value : customerPhone;
    const nextNote = field === "note" ? value : customerNote;

    if (field === "name") setCustomerName(value);
    else if (field === "phone") setCustomerPhone(value);
    else if (field === "note") setCustomerNote(value);

    if (invoice?.id) {
      try {
        const data = {
          name: nextName,
          phone: nextPhone,
          note: nextNote,
        };
        localStorage.setItem(`smart_invoice_customer_${invoice.id}`, JSON.stringify(data));
      } catch {
        // ignore
      }
    }
  }

  function handleSelectInvoice(selected: Invoice) {
    if (selected.id === invoice?.id) {
      setIsDraftsModalOpen(false);
      return;
    }
    if (isSaving) {
      setNoticeMessage("Đang lưu thay đổi, vui lòng đợi giây lát...");
      return;
    }
    setInvoice(selected);
    if (selected.status === "completed") {
      setOriginalCompletedInvoice(selected);
      setHasStagedChanges(false);
      setNoticeMessage(
        `Đang xem hóa đơn đã chốt #${String(selected.invoiceNumber).padStart(6, "0")}`,
      );
    } else {
      setOriginalCompletedInvoice(null);
      setHasStagedChanges(false);
      setNoticeMessage(`Đã mở bản nháp #${String(selected.invoiceNumber).padStart(6, "0")}`);
    }
    loadCustomerForInvoice(selected.id);
    setIsDraftsModalOpen(false);
  }

  async function handleCreateNewDraft() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      localStorage.removeItem("smart_invoice_active_draft_id");
      const result = await actions.createInvoiceDraft.execute();
      if (result.ok) {
        setInvoice(result.value);
        setOriginalCompletedInvoice(null);
        setHasStagedChanges(false);
        loadCustomerForInvoice(result.value.id);
        setNoticeMessage(
          `Đã tạo bản nháp mới #${String(result.value.invoiceNumber).padStart(6, "0")}`,
        );
        void refreshInvoices();
      } else {
        setErrorMessage("Không thể tạo bản nháp mới.");
      }
    } catch {
      setErrorMessage("Không thể tạo bản nháp mới.");
    } finally {
      setIsLoading(false);
      setIsDraftsModalOpen(false);
    }
  }

  async function handleDeleteDraft(target: Invoice) {
    if (actions.deleteInvoiceDraft) {
      await actions.deleteInvoiceDraft.execute(target.id);
    }
    try {
      localStorage.removeItem(`smart_invoice_customer_${target.id}`);
      if (localStorage.getItem("smart_invoice_active_draft_id") === target.id) {
        localStorage.removeItem("smart_invoice_active_draft_id");
      }
    } catch {
      // ignore
    }

    if (target.id === invoice?.id) {
      const remaining = drafts.filter((d) => d.id !== target.id);
      if (remaining.length > 0) {
        setInvoice(remaining[0]);
        setOriginalCompletedInvoice(null);
        setHasStagedChanges(false);
        loadCustomerForInvoice(remaining[0].id);
        setNoticeMessage(`Đã xóa bản nháp #${String(target.invoiceNumber).padStart(6, "0")}`);
      } else {
        void handleCreateNewDraft();
      }
    } else {
      setNoticeMessage(`Đã xóa bản nháp #${String(target.invoiceNumber).padStart(6, "0")}`);
    }
    void refreshInvoices();
  }

  async function handleCompleteInvoice() {
    if (!invoice || invoice.status !== "draft" || invoice.items.length === 0) return;
    const unsaved = document.querySelector<HTMLInputElement>(
      '#invoice-workspace [data-dirty="true"]',
    );
    if (unsaved) {
      unsaved.focus();
      return;
    }
    setIsCompleting(true);
    setErrorMessage(null);
    try {
      if (actions.completeInvoice) {
        const result = await actions.completeInvoice.execute({ invoiceId: invoice.id });
        if (result.ok) {
          setInvoice(result.value);
          setOriginalCompletedInvoice(result.value);
          setHasStagedChanges(false);
          try {
            localStorage.removeItem("smart_invoice_active_draft_id");
          } catch {
            // ignore
          }
          setNoticeMessage(
            `Đã hoàn thành hóa đơn #${String(result.value.invoiceNumber).padStart(6, "0")}`,
          );
          onCompleteInvoice?.(result.value);
          void refreshInvoices();
          setIsReceiptModalOpen(true);
        } else {
          const message =
            "message" in result.error && typeof result.error.message === "string"
              ? result.error.message
              : "Không thể hoàn thành hóa đơn.";
          setErrorMessage(message);
        }
      } else {
        try {
          localStorage.removeItem("smart_invoice_active_draft_id");
        } catch {
          // ignore
        }
        onCompleteInvoice?.(invoice);
        setIsReceiptModalOpen(true);
      }
    } catch {
      setErrorMessage("Không thể hoàn thành hóa đơn.");
    } finally {
      setIsCompleting(false);
    }
  }

  async function handleConfirmOverwrite() {
    if (!invoice || invoice.status !== "completed" || !actions.overwriteCompletedInvoice) return;
    setIsOverwriting(true);
    setErrorMessage(null);
    try {
      const result = await actions.overwriteCompletedInvoice.execute({
        invoiceId: invoice.id,
        confirmed: true,
        items: invoice.items,
      });
      if (result.ok) {
        setInvoice(result.value);
        setOriginalCompletedInvoice(result.value);
        setHasStagedChanges(false);
        setIsConfirmOverwriteOpen(false);
        setNoticeMessage(
          `Đã cập nhật hóa đơn đã chốt #${String(result.value.invoiceNumber).padStart(6, "0")}`,
        );
        void refreshInvoices();
      } else {
        setErrorMessage("Không thể ghi đè hóa đơn đã chốt.");
        setIsConfirmOverwriteOpen(false);
      }
    } catch {
      setErrorMessage("Không thể ghi đè hóa đơn đã chốt.");
      setIsConfirmOverwriteOpen(false);
    } finally {
      setIsOverwriting(false);
    }
  }

  function handleDiscardChanges() {
    if (originalCompletedInvoice) {
      setInvoice(originalCompletedInvoice);
      setHasStagedChanges(false);
      setNoticeMessage("Đã hủy các thay đổi trên hóa đơn.");
    }
  }

  // Queue semantic edits so rapid Tab entry cannot overwrite an earlier save.
  const applyChange = useCallback(
    (change: InvoiceItemChange): Promise<string | null> => {
      if (!invoice) return Promise.resolve("Hóa đơn chưa sẵn sàng. Vui lòng thử lại.");
      if (invoice.status === "completed") {
        try {
          const now = new Date().toISOString();
          const nextItems = applyItemChangeInMemory(invoice.items, invoice.id, change, now);
          const updated = invoice.overwriteCompleted(nextItems, now);
          setInvoice(updated);
          setHasStagedChanges(true);
          setErrorMessage(null);
          return Promise.resolve(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Chưa lưu được thay đổi.";
          setErrorMessage(message);
          return Promise.resolve(message);
        }
      }
      setPendingChanges((count) => count + 1);
      const operation = changeQueue.current.then(async () => {
        try {
          const result = await actions.applyInvoiceItemChange.execute({
            invoiceId: invoice.id,
            change,
          });
          if (result.ok) {
            setInvoice(result.value);
            setErrorMessage(null);
            return null;
          }
          const message =
            result.error.code === "validation"
              ? "Giá trị hoặc tổng tiền vượt giới hạn hợp lệ. Hãy kiểm tra lại."
              : "Chưa lưu được thay đổi. Hãy thử lại ô vừa sửa.";
          setErrorMessage(message);
          return message;
        } catch {
          const message = "Chưa lưu được thay đổi. Hãy thử lại ô vừa sửa.";
          setErrorMessage(message);
          return message;
        } finally {
          setPendingChanges((count) => count - 1);
        }
      });
      changeQueue.current = operation;
      return operation;
    },
    [actions.applyInvoiceItemChange, invoice],
  );

  async function handleRemoveItem(itemId: string) {
    const item = invoice?.items.find((entry) => entry.id === itemId);
    if (!item) return null;
    const failure = await applyChange({ type: "remove", itemId });
    if (!failure) {
      setLastRemoved(item);
      setNoticeMessage(null);
      document.querySelector<HTMLInputElement>('[data-product-input="true"]')?.focus();
    }
    return failure;
  }

  const handleUndoRemove = useCallback(async () => {
    if (!lastRemoved || isSaving || selectionPending.current) return;
    selectionPending.current = true;
    const item = lastRemoved;
    const error = await applyChange({
      type: "add",
      productId: item.productId,
      unitId: item.unitId,
      productName: item.productName,
      productSku: item.productSku,
      productBrand: item.productBrand,
      unitName: item.unitName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      discountBasisPoints: item.discountBasisPoints,
    });
    selectionPending.current = false;
    if (!error) {
      setLastRemoved(null);
      setNoticeMessage(`Đã khôi phục dòng “${item.productName}”`);
      document.querySelector<HTMLInputElement>('[data-product-input="true"]')?.focus();
    }
  }, [applyChange, isSaving, lastRemoved]);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      const active = document.activeElement;
      const isEditing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        !isEditing &&
        lastRemoved
      ) {
        event.preventDefault();
        void handleUndoRemove();
      }
      if (
        event.key === "F2" ||
        (event.key === "/" && !isEditing && !event.ctrlKey && !event.metaKey && !event.altKey)
      ) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-product-input="true"]')?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleUndoRemove, lastRemoved]);

  const invoiceNumber = invoice ? `#${String(invoice.invoiceNumber).padStart(6, "0")}` : "—";
  return (
    <div className="app-frame invoice-frame">
      <a className="invoice-skip-link" href="#invoice-workspace">
        Đến nội dung hóa đơn
      </a>
      <WorkspaceSidebar activeScreen={activeScreen} onNavigate={onNavigate} />
      <main className="workspace" id="invoice-workspace" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="breadcrumb">
              Không gian làm việc <span>/</span> Bán hàng
            </p>
            <div className="invoice-heading-row">
              <h1>{invoice?.status === "completed" ? "Chi tiết hóa đơn" : "Tạo hóa đơn mới"}</h1>
              <span className="invoice-live-badge">BÁN HÀNG</span>
              <span className="invoice-id-badge">{invoiceNumber}</span>
              {invoice?.status === "completed" && (
                <span className="invoice-status-tag is-completed">ĐÃ HOÀN TẤT</span>
              )}
              <button
                type="button"
                className="btn-new-draft-header"
                onClick={() => void handleCreateNewDraft()}
                title="Tạo hóa đơn nháp mới"
                disabled={isSaving || isLoading}
              >
                <InvoiceIcon name="plus" size={13} />
                Tạo mới
              </button>
            </div>
          </div>
          <div className="invoice-header-actions">
            <div className="invoice-header-status" role="status">
              <span className={`invoice-status-dot ${isSaving || isLoading ? "is-pending" : ""}`} />
              {isLoading
                ? "Đang mở hóa đơn…"
                : isSaving
                  ? "Đang lưu thay đổi…"
                  : invoice?.status === "completed"
                    ? hasStagedChanges
                      ? "Có thay đổi chưa lưu (chờ ghi đè)"
                      : "Hóa đơn đã chốt"
                    : errorMessage
                      ? "Cần kiểm tra bản nháp"
                      : "Bản nháp đã được lưu"}
            </div>
          </div>
        </header>
        <div className="invoice-feedback" aria-live="polite">
          {noticeMessage && (
            <span>
              <InvoiceIcon name="check" size={15} />
              {noticeMessage}
            </span>
          )}
        </div>
        {invoice?.status === "completed" && hasStagedChanges && (
          <div className="notice warning notice-staged-changes" role="alert">
            <InvoiceIcon name="alert" size={16} />
            <div className="notice-staged-content">
              <strong>Hóa đơn đã chốt đang có thay đổi tạm thời.</strong>
              <span>
                Các chỉnh sửa chưa được lưu vào cơ sở dữ liệu cho đến khi bạn nhấn &quot;Lưu ghi
                đè&quot;.
              </span>
            </div>
            <button
              type="button"
              className="secondary-button btn-discard-banner"
              onClick={handleDiscardChanges}
              disabled={isSaving}
            >
              Hủy thay đổi
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="notice error" role="alert">
            {errorMessage}
            {!invoice && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setErrorMessage(null);
                  setLoadAttempt((attempt) => attempt + 1);
                }}
              >
                Thử lại
              </button>
            )}
          </div>
        )}
        {lastRemoved && (
          <div className="toast-undo" role="alert">
            <span>Đã xóa "{lastRemoved.productName}" khỏi hóa đơn.</span>
            <button
              type="button"
              className="btn-undo-action"
              ref={undoButtonRef}
              disabled={isSaving}
              onClick={() => void handleUndoRemove()}
            >
              <InvoiceIcon name="undo" size={16} />
              Hoàn tác <kbd>Ctrl+Z</kbd>
            </button>
          </div>
        )}
        <section className="invoice-customer-card" aria-label="Thông tin khách hàng">
          <div className="invoice-customer-field invoice-customer-main">
            <label htmlFor="customer-name-input">
              <InvoiceIcon name="user" size={13} />
              Tên khách hàng
            </label>
            <input
              id="customer-name-input"
              type="text"
              className="invoice-customer-input"
              placeholder="Nhập tên khách hàng (VD: Anh Tuấn, Chị Mai, Khách lẻ...)"
              value={customerName}
              onChange={(e) => handleCustomerChange("name", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("customer-phone-input")?.focus();
                }
              }}
            />
          </div>
          <div className="invoice-customer-field invoice-customer-phone">
            <label htmlFor="customer-phone-input">
              <InvoiceIcon name="phone" size={13} />
              Số điện thoại
            </label>
            <input
              id="customer-phone-input"
              type="tel"
              className="invoice-customer-input"
              placeholder="Số điện thoại..."
              value={customerPhone}
              onChange={(e) => handleCustomerChange("phone", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.querySelector<HTMLInputElement>('[data-product-input="true"]')?.focus();
                }
              }}
            />
          </div>
          <div className="invoice-customer-field invoice-customer-note">
            <label htmlFor="customer-note-input">
              <InvoiceIcon name="note" size={13} />
              Ghi chú
            </label>
            <input
              id="customer-note-input"
              type="text"
              className="invoice-customer-input"
              placeholder="Ghi chú đơn hàng..."
              value={customerNote}
              onChange={(e) => handleCustomerChange("note", e.target.value)}
            />
          </div>
        </section>
        <InvoiceLineItems
          key={invoice?.id}
          items={invoice?.items ?? []}
          isLoading={isLoading}
          isReady={Boolean(invoice)}
          onCommit={applyChange}
          onRemove={handleRemoveItem}
          searchProducts={actions.searchProducts}
          onNavigateToProducts={onNavigateToProducts}
          onOpenDrafts={() => {
            void refreshInvoices();
            setIsDraftsModalOpen((open) => !open);
          }}
          draftsCount={drafts.length}
          isDraftsOpen={isDraftsModalOpen}
        />
        <footer className="invoice-footer-bar">
          {invoice?.status === "completed" ? (
            hasStagedChanges ? (
              <div className="invoice-action-group completed-edit-actions">
                <button
                  type="button"
                  className="secondary-button btn-discard-changes"
                  onClick={handleDiscardChanges}
                  disabled={isSaving}
                >
                  Hủy thay đổi
                </button>
                <button
                  type="button"
                  className="primary-button btn-save-overwrite"
                  disabled={isSaving || !invoice.items.length || Boolean(errorMessage)}
                  onClick={() => setIsConfirmOverwriteOpen(true)}
                >
                  <InvoiceIcon name="check" size={16} />
                  Lưu ghi đè
                </button>
              </div>
            ) : (
              <div className="invoice-action-group completed-view-actions">
                <button
                  type="button"
                  className="secondary-button btn-new-invoice-footer"
                  onClick={() => void handleCreateNewDraft()}
                  disabled={isSaving || isLoading}
                >
                  <InvoiceIcon name="plus" size={16} />
                  Tạo hóa đơn mới
                </button>
                <button
                  type="button"
                  className="primary-button btn-print-completed"
                  onClick={() => {
                    setIsReceiptModalOpen(true);
                  }}
                >
                  <InvoiceIcon name="receipt" size={16} />
                  In hóa đơn
                </button>
              </div>
            )
          ) : (
            <div className="invoice-action-group">
              <button
                type="button"
                className="primary-button btn-complete-invoice"
                disabled={
                  (!actions.completeInvoice && !onCompleteInvoice) ||
                  !invoice?.items.length ||
                  isSaving ||
                  isCompleting ||
                  Boolean(errorMessage)
                }
                aria-describedby={
                  !actions.completeInvoice && !onCompleteInvoice
                    ? "invoice-completion-help"
                    : undefined
                }
                onClick={() => void handleCompleteInvoice()}
              >
                {isCompleting ? "Đang hoàn tất…" : "Hoàn thành"}
                <InvoiceIcon name="arrow" size={16} />
              </button>
              {!actions.completeInvoice && !onCompleteInvoice && (
                <p id="invoice-completion-help">Chưa khả dụng</p>
              )}
            </div>
          )}
        </footer>
        {isDraftsModalOpen && (
          <div
            className="invoice-drafts-modal-backdrop"
            onClick={() => setIsDraftsModalOpen(false)}
            role="presentation"
          >
            <div
              className="invoice-drafts-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="drafts-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="invoice-drafts-modal-header">
                <div className="drafts-modal-title-wrap">
                  <InvoiceIcon name="receipt" size={18} />
                  <h2 id="drafts-modal-title">Bản nháp đã lưu</h2>
                </div>
                <div className="invoices-modal-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    id="tab-drafts"
                    aria-selected={invoicesTab === "drafts"}
                    aria-controls="panel-drafts"
                    className={`invoices-modal-tab ${invoicesTab === "drafts" ? "is-active" : ""}`}
                    onClick={() => setInvoicesTab("drafts")}
                  >
                    Bản nháp ({drafts.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="tab-completed"
                    aria-selected={invoicesTab === "completed"}
                    aria-controls="panel-completed"
                    className={`invoices-modal-tab ${invoicesTab === "completed" ? "is-active" : ""}`}
                    onClick={() => setInvoicesTab("completed")}
                  >
                    Đã hoàn thành ({completedInvoices.length})
                  </button>
                </div>
                <div className="drafts-modal-actions">
                  <button
                    type="button"
                    className="primary-button btn-create-draft-modal"
                    onClick={() => void handleCreateNewDraft()}
                  >
                    <InvoiceIcon name="plus" size={14} />
                    Tạo mới
                  </button>
                  <button
                    type="button"
                    className="btn-close-drafts-modal"
                    onClick={() => setIsDraftsModalOpen(false)}
                    aria-label="Đóng danh sách hóa đơn"
                  >
                    <InvoiceIcon name="close" size={16} />
                  </button>
                </div>
              </div>

              <div className="invoice-drafts-modal-body">
                {invoicesTab === "drafts" ? (
                  drafts.length === 0 ? (
                    <div className="drafts-empty-state">
                      <InvoiceIcon name="receipt" size={32} />
                      <p>Chưa có bản nháp nào được lưu.</p>
                    </div>
                  ) : (
                    <ul className="drafts-list" role="list" id="panel-drafts">
                      {drafts.map((d) => {
                        const isCurrent = d.id === invoice?.id;
                        const customerData = getSavedCustomer(d.id);
                        return (
                          <li
                            key={d.id}
                            className={`draft-item-card ${isCurrent ? "is-active-draft" : ""}`}
                            onClick={() => handleSelectInvoice(d)}
                          >
                            <div className="draft-card-main">
                              <div className="draft-card-heading">
                                <span className="draft-card-number">
                                  #{String(d.invoiceNumber).padStart(6, "0")}
                                </span>
                                {isCurrent && <span className="draft-current-tag">Đang mở</span>}
                                <span className="draft-time">
                                  {formatRelativeTime(d.updatedAt)}
                                </span>
                              </div>
                              <div className="draft-card-details">
                                <span className="draft-customer-name">
                                  <InvoiceIcon name="user" size={12} />
                                  {customerData?.name || "Khách lẻ"}
                                </span>
                                <span className="draft-items-count">
                                  <InvoiceIcon name="box" size={12} />
                                  {d.items.length} mặt hàng
                                </span>
                              </div>
                            </div>
                            <div className="draft-card-aside">
                              <strong className="draft-card-total">
                                {d.total.toLocaleString("vi-VN")} ₫
                              </strong>
                              <div className="draft-card-buttons">
                                <button
                                  type="button"
                                  className={
                                    isCurrent
                                      ? "secondary-button btn-open-draft"
                                      : "primary-button btn-open-draft"
                                  }
                                  disabled={isCurrent}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectInvoice(d);
                                  }}
                                >
                                  {isCurrent ? "Đang sửa" : "Mở bản nháp"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete-draft"
                                  title="Xóa bản nháp này"
                                  aria-label={`Xóa bản nháp #${String(d.invoiceNumber).padStart(6, "0")}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteDraft(d);
                                  }}
                                >
                                  <InvoiceIcon name="trash" size={13} />
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : completedInvoices.length === 0 ? (
                  <div className="drafts-empty-state">
                    <InvoiceIcon name="receipt" size={32} />
                    <p>Chưa có hóa đơn nào hoàn thành.</p>
                  </div>
                ) : (
                  <ul className="drafts-list" role="list" id="panel-completed">
                    {completedInvoices.map((c) => {
                      const isCurrent = c.id === invoice?.id;
                      const customerData = getSavedCustomer(c.id);
                      return (
                        <li
                          key={c.id}
                          className={`draft-item-card ${isCurrent ? "is-active-draft" : ""}`}
                          onClick={() => handleSelectInvoice(c)}
                        >
                          <div className="draft-card-main">
                            <div className="draft-card-heading">
                              <span className="draft-card-number">
                                #{String(c.invoiceNumber).padStart(6, "0")}
                              </span>
                              <span className="draft-completed-tag">Đã chốt</span>
                              {isCurrent && <span className="draft-current-tag">Đang mở</span>}
                              <span className="draft-time">
                                {c.completedAt
                                  ? formatRelativeTime(c.completedAt)
                                  : formatRelativeTime(c.updatedAt)}
                              </span>
                            </div>
                            <div className="draft-card-details">
                              <span className="draft-customer-name">
                                <InvoiceIcon name="user" size={12} />
                                {customerData?.name || "Khách lẻ"}
                              </span>
                              <span className="draft-items-count">
                                <InvoiceIcon name="box" size={12} />
                                {c.items.length} mặt hàng
                              </span>
                            </div>
                          </div>
                          <div className="draft-card-aside">
                            <strong className="draft-card-total">
                              {c.total.toLocaleString("vi-VN")} ₫
                            </strong>
                            <div className="draft-card-buttons">
                              <button
                                type="button"
                                className={
                                  isCurrent
                                    ? "secondary-button btn-open-draft"
                                    : "primary-button btn-open-draft"
                                }
                                disabled={isCurrent}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectInvoice(c);
                                }}
                              >
                                {isCurrent ? "Đang xem" : "Xem / Sửa"}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {isConfirmOverwriteOpen && (
          <div
            className="confirm-overwrite-backdrop"
            onClick={() => setIsConfirmOverwriteOpen(false)}
            role="presentation"
          >
            <div
              className="confirm-overwrite-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-overwrite-title"
              aria-describedby="confirm-overwrite-desc"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-overwrite-header">
                <div className="confirm-overwrite-icon-wrap">
                  <InvoiceIcon name="alert" size={24} />
                </div>
                <h3 id="confirm-overwrite-title">Xác nhận ghi đè hóa đơn đã chốt?</h3>
              </div>
              <p id="confirm-overwrite-desc" className="confirm-overwrite-body">
                Hóa đơn{" "}
                <strong>#{invoice ? String(invoice.invoiceNumber).padStart(6, "0") : ""}</strong> đã
                hoàn thành trước đó. Ghi đè sẽ cập nhật lại danh sách mặt hàng và tổng tiền mới (
                <strong>{invoice?.total.toLocaleString("vi-VN")} ₫</strong>). Số hóa đơn, thời điểm
                tạo và thời điểm hoàn thành ban đầu sẽ được giữ nguyên không đổi.
              </p>
              <div className="confirm-overwrite-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsConfirmOverwriteOpen(false)}
                  disabled={isSaving}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="primary-button btn-confirm-overwrite"
                  onClick={() => void handleConfirmOverwrite()}
                  disabled={isSaving}
                >
                  {isSaving ? "Đang ghi đè…" : "Xác nhận ghi đè"}
                </button>
              </div>
            </div>
          </div>
        )}
        <InvoiceReceiptPreviewModal
          invoice={invoice}
          customer={{
            name: customerName,
            phone: customerPhone,
            note: customerNote,
          }}
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          onNewDraft={() => {
            setIsReceiptModalOpen(false);
            void handleCreateNewDraft();
          }}
        />
      </main>
    </div>
  );
}

function getSavedCustomer(
  invoiceId: string,
): { name?: string; phone?: string; note?: string } | null {
  try {
    const raw = localStorage.getItem(`smart_invoice_customer_${invoiceId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${hours}:${mins} ${day}/${month}`;
  } catch {
    return isoString;
  }
}
