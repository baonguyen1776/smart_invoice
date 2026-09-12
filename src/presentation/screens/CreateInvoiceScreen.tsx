import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplyInvoiceItemChange,
  InvoiceItemChange,
} from "../../application/use-cases/ApplyInvoiceItemChange";
import type { CreateInvoiceDraft } from "../../application/use-cases/CreateInvoiceDraft";
import type { DeleteInvoiceDraft } from "../../application/use-cases/DeleteInvoiceDraft";
import type { ListInvoices } from "../../application/use-cases/ListInvoices";
import type { RestoreInvoiceDraft } from "../../application/use-cases/RestoreInvoiceDraft";
import type { SearchProducts } from "../../application/use-cases/SearchProducts";
import type { Invoice } from "../../domain/entities/Invoice";
import type { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InvoiceIcon } from "../components/InvoiceIcon";
import { InvoiceLineItems } from "../components/InvoiceLineItems";
import "./CreateInvoiceScreen.css";

export interface InvoiceScreenActions {
  readonly createInvoiceDraft: Pick<CreateInvoiceDraft, "execute">;
  readonly restoreInvoiceDraft?: Pick<RestoreInvoiceDraft, "execute">;
  readonly applyInvoiceItemChange: Pick<ApplyInvoiceItemChange, "execute">;
  readonly searchProducts: Pick<SearchProducts, "execute">;
  readonly listInvoices?: Pick<ListInvoices, "execute">;
  readonly deleteInvoiceDraft?: Pick<DeleteInvoiceDraft, "execute">;
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
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const changeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const selectionPending = useRef(false);
  const isSaving = pendingChanges > 0;

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

  const refreshDrafts = useCallback(async () => {
    if (!actions.listInvoices) return;
    try {
      const result = await actions.listInvoices.execute({ status: "draft" });
      if (result.ok) {
        setDrafts(result.value);
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
          loadCustomerForInvoice(result.value.id);
          void refreshDrafts();
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
    refreshDrafts,
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

  function handleSelectDraft(selected: Invoice) {
    if (selected.id === invoice?.id) {
      setIsDraftsModalOpen(false);
      return;
    }
    if (isSaving) {
      setNoticeMessage("Đang lưu thay đổi, vui lòng đợi giây lát...");
      return;
    }
    setInvoice(selected);
    loadCustomerForInvoice(selected.id);
    setIsDraftsModalOpen(false);
    setNoticeMessage(`Đã mở bản nháp #${String(selected.invoiceNumber).padStart(6, "0")}`);
  }

  async function handleCreateNewDraft() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      localStorage.removeItem("smart_invoice_active_draft_id");
      const result = await actions.createInvoiceDraft.execute();
      if (result.ok) {
        setInvoice(result.value);
        loadCustomerForInvoice(result.value.id);
        setNoticeMessage(
          `Đã tạo bản nháp mới #${String(result.value.invoiceNumber).padStart(6, "0")}`,
        );
        void refreshDrafts();
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
        loadCustomerForInvoice(remaining[0].id);
        setNoticeMessage(`Đã xóa bản nháp #${String(target.invoiceNumber).padStart(6, "0")}`);
      } else {
        void handleCreateNewDraft();
      }
    } else {
      setNoticeMessage(`Đã xóa bản nháp #${String(target.invoiceNumber).padStart(6, "0")}`);
    }
    void refreshDrafts();
  }

  // Queue semantic edits so rapid Tab entry cannot overwrite an earlier save.
  const applyChange = useCallback(
    (change: InvoiceItemChange): Promise<string | null> => {
      if (!invoice) return Promise.resolve("Hóa đơn chưa sẵn sàng. Vui lòng thử lại.");
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
              <h1>Tạo hóa đơn mới</h1>
              <span className="invoice-live-badge">BÁN HÀNG</span>
              <span className="invoice-id-badge">{invoiceNumber}</span>
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
                ? "Đang mở bản nháp…"
                : isSaving
                  ? "Đang lưu thay đổi…"
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
            void refreshDrafts();
            setIsDraftsModalOpen((open) => !open);
          }}
          draftsCount={drafts.length}
          isDraftsOpen={isDraftsModalOpen}
        />
        <footer className="invoice-footer-bar">
          <div className="invoice-action-group">
            <button
              type="button"
              className="primary-button btn-complete-invoice"
              disabled={
                !onCompleteInvoice || !invoice?.items.length || isSaving || Boolean(errorMessage)
              }
              aria-describedby={!onCompleteInvoice ? "invoice-completion-help" : undefined}
              onClick={() => {
                const unsaved = document.querySelector<HTMLInputElement>(
                  '#invoice-workspace [data-dirty="true"]',
                );
                if (unsaved) {
                  unsaved.focus();
                  return;
                }
                if (invoice) {
                  try {
                    localStorage.removeItem("smart_invoice_active_draft_id");
                  } catch {
                    // ignore
                  }
                  onCompleteInvoice?.(invoice);
                }
              }}
            >
              Hoàn thành
              <InvoiceIcon name="arrow" size={16} />
            </button>
            {!onCompleteInvoice && <p id="invoice-completion-help">Chưa khả dụng</p>}
          </div>
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
                  <span className="drafts-modal-count">{drafts.length}</span>
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
                    aria-label="Đóng danh sách bản nháp"
                  >
                    <InvoiceIcon name="close" size={16} />
                  </button>
                </div>
              </div>

              <div className="invoice-drafts-modal-body">
                {drafts.length === 0 ? (
                  <div className="drafts-empty-state">
                    <InvoiceIcon name="receipt" size={32} />
                    <p>Chưa có bản nháp nào được lưu.</p>
                  </div>
                ) : (
                  <ul className="drafts-list" role="list">
                    {drafts.map((d) => {
                      const isCurrent = d.id === invoice?.id;
                      const customerData = getSavedCustomer(d.id);
                      return (
                        <li
                          key={d.id}
                          className={`draft-item-card ${isCurrent ? "is-active-draft" : ""}`}
                          onClick={() => handleSelectDraft(d)}
                        >
                          <div className="draft-card-main">
                            <div className="draft-card-heading">
                              <span className="draft-card-number">
                                #{String(d.invoiceNumber).padStart(6, "0")}
                              </span>
                              {isCurrent && <span className="draft-current-tag">Đang mở</span>}
                              <span className="draft-time">{formatRelativeTime(d.updatedAt)}</span>
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
                                  handleSelectDraft(d);
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
                )}
              </div>
            </div>
          </div>
        )}
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
