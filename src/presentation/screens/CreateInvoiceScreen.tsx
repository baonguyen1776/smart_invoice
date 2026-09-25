import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplyInvoiceItemChange,
  InvoiceItemChange,
} from "../../application/use-cases/ApplyInvoiceItemChange";
import type { UpdateInvoiceOldDebt } from "../../application/use-cases/UpdateInvoiceOldDebt";
import type { UpdateInvoiceCustomer } from "../../application/use-cases/UpdateInvoiceCustomer";
import type { CompleteInvoice } from "../../application/use-cases/CompleteInvoice";
import type { CreateInvoiceDraft } from "../../application/use-cases/CreateInvoiceDraft";
import type { DeleteInvoiceDraft } from "../../application/use-cases/DeleteInvoiceDraft";
import type { ListInvoices } from "../../application/use-cases/ListInvoices";
import type { MarkInvoicePrinted } from "../../application/use-cases/MarkInvoicePrinted";
import type { OverwriteCompletedInvoice } from "../../application/use-cases/OverwriteCompletedInvoice";
import type { RestoreInvoiceDraft } from "../../application/use-cases/RestoreInvoiceDraft";
import type { SearchProducts } from "../../application/use-cases/SearchProducts";
import type { Invoice } from "../../domain/entities/Invoice";
import { InvoiceItem } from "../../domain/entities/InvoiceItem";
import { InvoiceIcon } from "../components/InvoiceIcon";
import { InvoiceLineItems } from "../components/InvoiceLineItems";
import { InvoiceReceiptPreviewModal } from "../components/InvoiceReceiptPreviewModal";
import { CurrencyInput } from "../components/CurrencyInput";
import { QuickCalculatorButton } from "../components/QuickCalculator";
import "./CreateInvoiceScreen.css";

export interface InvoiceScreenActions {
  readonly updateInvoiceOldDebt?: Pick<UpdateInvoiceOldDebt, "execute">;
  readonly updateInvoiceCustomer?: Pick<UpdateInvoiceCustomer, "execute">;
  readonly createInvoiceDraft: Pick<CreateInvoiceDraft, "execute">;
  readonly restoreInvoiceDraft?: Pick<RestoreInvoiceDraft, "execute">;
  readonly applyInvoiceItemChange: Pick<ApplyInvoiceItemChange, "execute">;
  readonly searchProducts: Pick<SearchProducts, "execute">;
  readonly listInvoices?: Pick<ListInvoices, "execute">;
  readonly deleteInvoiceDraft?: Pick<DeleteInvoiceDraft, "execute">;
  readonly completeInvoice?: Pick<CompleteInvoice, "execute">;
  readonly overwriteCompletedInvoice?: Pick<OverwriteCompletedInvoice, "execute">;
  readonly markInvoicePrinted?: Pick<MarkInvoicePrinted, "execute">;
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
  readonly onNavigate?: (screen: "invoice" | "products" | "history") => void;
  readonly activeScreen?: "invoice" | "products" | "history";
  readonly onCompleteInvoice?: (invoice: Invoice) => void;
  readonly editingInvoice?: Invoice | null;
  readonly isCalculatorOpen?: boolean;
  readonly onToggleCalculator?: () => void;
}

export function CreateInvoiceScreen(props: CreateInvoiceScreenProps) {
  const [selection, setSelection] = useState({ invoice: props.editingInvoice, session: 0 });
  if (selection.invoice !== props.editingInvoice) {
    setSelection({ invoice: props.editingInvoice, session: selection.session + 1 });
  }
  return <InvoiceEditor key={selection.session} {...props} />;
}

function InvoiceEditor({
  actions,
  onNavigateToProducts,
  onNavigate,
  activeScreen = "invoice",
  onCompleteInvoice,
  editingInvoice,
  isCalculatorOpen = false,
  onToggleCalculator,
}: CreateInvoiceScreenProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(editingInvoice ?? null);
  const [isLoading, setIsLoading] = useState(!editingInvoice);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [lastRemoved, setLastRemoved] = useState<InvoiceItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(editingInvoice?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editingInvoice?.customerPhone ?? "");
  const [customerNote, setCustomerNote] = useState(editingInvoice?.customerNote ?? "");
  const [drafts, setDrafts] = useState<readonly Invoice[]>([]);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [originalCompletedInvoice, setOriginalCompletedInvoice] = useState<Invoice | null>(
    editingInvoice?.status === "completed" ? editingInvoice : null,
  );
  const [hasStagedChanges, setHasStagedChanges] = useState(false);
  const [isConfirmOverwriteOpen, setIsConfirmOverwriteOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const changeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const selectionPending = useRef(false);
  const [hasPendingInput, setHasPendingInput] = useState(false);
  const [gridReset, setGridReset] = useState(0);
  const [oldDebtInput, setOldDebtInput] = useState(
    editingInvoice?.oldDebt ? String(editingInvoice.oldDebt) : "",
  );
  const [oldDebtError, setOldDebtError] = useState<string | null>(null);
  const [oldDebtDirty, setOldDebtDirty] = useState(false);
  const oldDebtRevision = useRef(0);
  const [customerDirty, setCustomerDirty] = useState(false);
  const customerRevision = useRef(0);
  const activeInvoice = useRef(invoice);
  const isMounted = useRef(true);
  const deletingDraft = useRef(false);
  const latestDraftListRequest = useRef(0);
  const isSaving = pendingChanges > 0 || isOverwriting;
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  function updateInvoice(value: Invoice) {
    activeInvoice.current = value;
    setInvoice(value);
  }
  function resetEditor(value: Invoice) {
    updateInvoice(value);
    setLastRemoved(null);
    setHasPendingInput(false);
    setHasStagedChanges(false);
    setCustomerDirty(false);
    setErrorMessage(null);
    setIsConfirmOverwriteOpen(false);
    setIsReceiptModalOpen(false);
    setOriginalCompletedInvoice(value.status === "completed" ? value : null);
    loadCustomerForInvoice(value.id, value);
  }

  const [loadAttempt, setLoadAttempt] = useState(0);
  const draftRequest = useRef<{
    action:
      InvoiceScreenActions["createInvoiceDraft"] | InvoiceScreenActions["restoreInvoiceDraft"];
    attempt: number;
    promise: ReturnType<InvoiceScreenActions["createInvoiceDraft"]["execute"]>;
  } | null>(null);

  const loadCustomerForInvoice = useCallback((invoiceId: string, entity: Invoice) => {
    // A pending cache is recovery input; successful writes remove it. Older caches
    // without that marker are migrated only when SQLite has no customer fields.
    const cached = entity.status === "draft" ? getSavedCustomer(invoiceId, undefined, true) : null;
    const legacy =
      cached ??
      (entity.status === "draft" &&
      !entity.customerName &&
      !entity.customerPhone &&
      !entity.customerAddress &&
      !entity.customerNote
        ? getSavedCustomer(invoiceId)
        : null);
    const customer = {
      name: legacy?.name ?? entity.customerName ?? "",
      phone: legacy?.phone ?? entity.customerPhone ?? "",
      address: legacy?.address ?? entity.customerAddress,
      note: legacy?.note ?? entity.customerNote ?? "",
    };
    setOldDebtInput(entity.oldDebt ? String(entity.oldDebt) : "");
    setOldDebtDirty(false);
    setOldDebtError(null);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerNote(customer.note);
    setCustomerDirty(Boolean(legacy));
    if (legacy) {
      const recovered = entity.withCustomer(customer, entity.updatedAt);
      activeInvoice.current = recovered;
      setInvoice(recovered);
    }
    try {
      localStorage.setItem("smart_invoice_active_draft_id", invoiceId);
    } catch {
      /* Optional navigation preference. */
    }
  }, []);

  const refreshInvoices = useCallback(async () => {
    if (!actions.listInvoices) return;
    const request = ++latestDraftListRequest.current;
    try {
      const draftsResult = await actions.listInvoices.execute({ status: "draft" });
      if (draftsResult.ok && isMounted.current && request === latestDraftListRequest.current) {
        setDrafts(draftsResult.value);
      }
    } catch {
      // ignore
    }
  }, [actions.listInvoices]);

  useEffect(() => {
    let isCancelled = false;
    if (editingInvoice) {
      void Promise.resolve().then(() => {
        if (!isCancelled) {
          loadCustomerForInvoice(editingInvoice.id, editingInvoice);
          void refreshInvoices();
        }
      });
      return () => {
        isCancelled = true;
      };
    }
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
          activeInvoice.current = result.value;
          setInvoice(result.value);
          if (result.value.status === "completed") {
            setOriginalCompletedInvoice(result.value);
          }
          loadCustomerForInvoice(result.value.id, result.value);
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
    editingInvoice,
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
    if (lastRemoved) undoButtonRef.current?.focus({ preventScroll: true });
  }, [lastRemoved]);

  function handleCustomerChange(field: "name" | "phone" | "note", value: string) {
    const current = activeInvoice.current;
    if (!current) return;
    const customer = {
      name: field === "name" ? value : customerName,
      phone: field === "phone" ? value : customerPhone,
      address: current.customerAddress,
      note: field === "note" ? value : customerNote,
    };
    try {
      updateInvoice(current.withCustomer(customer));
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
      setCustomerNote(customer.note);
      customerRevision.current += 1;
      setCustomerDirty(true);
      if (current.status === "draft") {
        try {
          localStorage.setItem(
            `smart_invoice_customer_${current.id}`,
            JSON.stringify({ ...customer, pending: true }),
          );
        } catch {
          /* SQLite persistence remains available when browser storage is disabled. */
        }
      }
      if (current.status === "completed") setHasStagedChanges(true);
    } catch {
      setErrorMessage("Thông tin khách hàng chưa hợp lệ.");
    }
  }

  const preservePendingOldDebt = useCallback((saved: Invoice, oldDebt: number): Invoice => {
    try {
      return saved.withOldDebt(oldDebt, saved.updatedAt);
    } catch {
      // A queued item save may change the allowed combined total after debt was
      // entered. Keep the committed items and mark that debt input for correction.
      setOldDebtError("Nợ cũ và tổng tiền vượt giới hạn hợp lệ. Hãy kiểm tra lại.");
      return saved;
    }
  }, []);

  function saveCustomer() {
    const current = activeInvoice.current;
    if (!current || current.status !== "draft" || !customerDirty || !actions.updateInvoiceCustomer)
      return;
    const revision = customerRevision.current;
    const customer = {
      name: customerName,
      phone: customerPhone,
      address: current.customerAddress,
      note: customerNote,
    };
    setPendingChanges((count) => count + 1);
    const operation = changeQueue.current.then(async () => {
      try {
        const result = await actions.updateInvoiceCustomer!.execute({
          invoiceId: current.id,
          customer,
        });
        if (!isMounted.current || activeInvoice.current?.id !== current.id) return;
        if (!result.ok) {
          setErrorMessage("Chưa lưu được thông tin khách hàng. Vui lòng thử lại.");
          return;
        }
        if (customerRevision.current === revision) {
          updateInvoice(preservePendingOldDebt(result.value, activeInvoice.current.oldDebt));
          setCustomerDirty(false);
          try {
            localStorage.removeItem(`smart_invoice_customer_${current.id}`);
          } catch {
            /* Legacy cache is optional. */
          }
        }
        setErrorMessage(null);
        void refreshInvoices();
      } catch {
        if (isMounted.current && activeInvoice.current?.id === current.id)
          setErrorMessage("Chưa lưu được thông tin khách hàng. Vui lòng thử lại.");
      } finally {
        if (isMounted.current) setPendingChanges((count) => count - 1);
      }
    });
    changeQueue.current = operation;
  }

  function handleOldDebtChange(value: string) {
    setOldDebtInput(value);
    oldDebtRevision.current += 1;
    const current = activeInvoice.current;
    if (!current) return;
    if (current.status === "completed") setHasStagedChanges(true);
    try {
      if (value) {
        if (!/^\d+$/.test(value) && !/^\d{1,3}(\.\d{3})*$/.test(value)) {
          throw new Error();
        }
        const clean = value.replace(/\./g, "");
        const num = Number(clean);
        if (!Number.isSafeInteger(num) || num < 0) {
          throw new Error();
        }
        updateInvoice(current.withOldDebt(num, current.updatedAt));
      } else {
        updateInvoice(current.withOldDebt(0, current.updatedAt));
      }
      setOldDebtError(null);
      setOldDebtDirty(true);
    } catch {
      setOldDebtError("Nhập số nguyên VND từ 0 trở lên, trong giới hạn tổng tiền hợp lệ.");
    }
  }

  function saveOldDebt() {
    const current = activeInvoice.current;
    if (
      !current ||
      current.status !== "draft" ||
      !oldDebtDirty ||
      oldDebtError ||
      !actions.updateInvoiceOldDebt
    )
      return;
    const revision = oldDebtRevision.current;
    setPendingChanges((count) => count + 1);
    const operation = changeQueue.current.then(async () => {
      try {
        const result = await actions.updateInvoiceOldDebt!.execute({
          invoiceId: current.id,
          oldDebt: current.oldDebt,
        });
        if (!isMounted.current || activeInvoice.current?.id !== current.id) return;
        if (!result.ok) {
          setErrorMessage("Chưa lưu được nợ cũ. Vui lòng thử lại.");
          return;
        }
        // Other editor input may have changed while this save was queued.
        if (oldDebtRevision.current === revision) setOldDebtDirty(false);
        setErrorMessage(null);
        void refreshInvoices();
      } catch {
        if (isMounted.current && activeInvoice.current?.id === current.id)
          setErrorMessage("Chưa lưu được nợ cũ. Vui lòng thử lại.");
      } finally {
        if (isMounted.current) setPendingChanges((count) => count - 1);
      }
    });
    changeQueue.current = operation;
  }

  function handleSelectInvoice(selected: Invoice) {
    if (selected.id === invoice?.id) {
      setIsDraftsModalOpen(false);
      return;
    }
    if (oldDebtError || (oldDebtDirty && invoice?.status === "draft")) {
      saveOldDebt();
      setNoticeMessage("Cần lưu nợ cũ hợp lệ trước khi chuyển hóa đơn.");
      return;
    }
    if (isSaving || isCompleting || (customerDirty && invoice?.status === "draft")) {
      if (!isSaving) saveCustomer();
      setNoticeMessage("Cần lưu xong thay đổi trước khi chuyển hóa đơn.");
      return;
    }
    resetEditor(selected);
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
    loadCustomerForInvoice(selected.id, selected);
    setIsDraftsModalOpen(false);
  }

  async function handleCreateNewDraft() {
    if (isSaving || isLoading || isCompleting) return;
    if (
      activeInvoice.current &&
      (oldDebtError || (oldDebtDirty && activeInvoice.current.status === "draft"))
    ) {
      saveOldDebt();
      return;
    }
    if (customerDirty && activeInvoice.current?.status === "draft") {
      saveCustomer();
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await actions.createInvoiceDraft.execute();
      if (!isMounted.current) return;
      if (result.ok) {
        resetEditor(result.value);
        setOriginalCompletedInvoice(null);
        setHasStagedChanges(false);
        loadCustomerForInvoice(result.value.id, result.value);
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
    if (!actions.deleteInvoiceDraft || deletingDraft.current || isSaving || isCompleting) return;
    deletingDraft.current = true;
    try {
      const result = await actions.deleteInvoiceDraft.execute(target.id);
      if (!isMounted.current) return;
      if (!result.ok) {
        setErrorMessage("Không thể xóa bản nháp. Vui lòng thử lại.");
        return;
      }
      try {
        localStorage.removeItem(`smart_invoice_customer_${target.id}`);
        if (localStorage.getItem("smart_invoice_active_draft_id") === target.id)
          localStorage.removeItem("smart_invoice_active_draft_id");
      } catch {
        /* Optional navigation preference and legacy cache. */
      }
      setErrorMessage(null);
      if (target.id === activeInvoice.current?.id) {
        const remaining = drafts.filter((draft) => draft.id !== target.id);
        if (remaining[0]) resetEditor(remaining[0]);
        else {
          activeInvoice.current = null;
          setInvoice(null);
          setLastRemoved(null);
          setHasPendingInput(false);
          setCustomerDirty(false);
          setCustomerName("");
          setCustomerPhone("");
          setCustomerNote("");
          await handleCreateNewDraft();
        }
      }
      setNoticeMessage(`Đã xóa bản nháp #${String(target.invoiceNumber).padStart(6, "0")}`);
      void refreshInvoices();
    } catch {
      if (isMounted.current) setErrorMessage("Không thể xóa bản nháp. Vui lòng thử lại.");
    } finally {
      deletingDraft.current = false;
    }
  }

  async function handleCompleteInvoice() {
    if (
      !invoice ||
      invoice.status !== "draft" ||
      invoice.items.length === 0 ||
      isSaving ||
      isCompleting ||
      hasPendingInput ||
      Boolean(oldDebtError)
    )
      return;
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
        const result = await actions.completeInvoice.execute({
          invoiceId: invoice.id,
          oldDebt: invoice.oldDebt,
          customer: {
            name: customerName,
            phone: customerPhone,
            address: invoice.customerAddress,
            note: customerNote,
          },
        });
        if (!isMounted.current) return;
        if (result.ok) {
          updateInvoice(result.value);
          setCustomerDirty(false);
          setOldDebtDirty(false);
          setOriginalCompletedInvoice(result.value);
          setHasStagedChanges(false);
          try {
            localStorage.removeItem("smart_invoice_active_draft_id");
            localStorage.removeItem(`smart_invoice_customer_${invoice.id}`);
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
    if (
      !invoice ||
      invoice.status !== "completed" ||
      !actions.overwriteCompletedInvoice ||
      isSaving ||
      hasPendingInput ||
      Boolean(oldDebtError)
    )
      return;
    setIsOverwriting(true);
    setErrorMessage(null);
    try {
      const result = await actions.overwriteCompletedInvoice.execute({
        invoiceId: invoice.id,
        confirmed: true,
        oldDebt: invoice.oldDebt,
        items: invoice.items,
        customer: {
          name: customerName,
          phone: customerPhone,
          address: invoice.customerAddress,
          note: customerNote,
        },
      });
      if (!isMounted.current) return;
      if (result.ok) {
        updateInvoice(result.value);
        setCustomerDirty(false);
        try {
          localStorage.removeItem(`smart_invoice_customer_${invoice.id}`);
        } catch {
          /* Optional legacy cache. */
        }
        setOldDebtDirty(false);
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
      resetEditor(originalCompletedInvoice);
      setGridReset((value) => value + 1);
      setHasStagedChanges(false);
      setNoticeMessage("Đã hủy các thay đổi trên hóa đơn.");
    }
  }

  // Queue semantic edits so rapid Tab entry cannot overwrite an earlier save.
  const applyChange = useCallback(
    (change: InvoiceItemChange): Promise<string | null> => {
      const invoice = activeInvoice.current;
      if (!invoice) return Promise.resolve("Hóa đơn chưa sẵn sàng. Vui lòng thử lại.");
      if (invoice.status === "completed") {
        try {
          const now = new Date().toISOString();
          const nextItems = applyItemChangeInMemory(invoice.items, invoice.id, change, now);
          const updated = invoice.overwriteCompleted(nextItems, now);
          updateInvoice(updated);
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
          if (!isMounted.current || activeInvoice.current?.id !== invoice.id) return null;
          if (result.ok) {
            const current = activeInvoice.current;
            const saved = result.value.withCustomer(
              {
                name: current.customerName,
                phone: current.customerPhone,
                address: current.customerAddress,
                note: current.customerNote,
              },
              result.value.updatedAt,
            );
            const next = preservePendingOldDebt(saved, current.oldDebt);
            activeInvoice.current = next;
            setInvoice(next);
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
    [actions.applyInvoiceItemChange, preservePendingOldDebt],
  );

  async function handleRemoveItem(itemId: string) {
    const item = invoice?.items.find((entry) => entry.id === itemId);
    if (!item) return null;
    const failure = await applyChange({ type: "remove", itemId });
    if (!failure && isMounted.current && activeInvoice.current?.id === item.invoiceId) {
      setLastRemoved(item);
      setNoticeMessage(null);
      document
        .querySelector<HTMLInputElement>('[data-product-input="true"]')
        ?.focus({ preventScroll: true });
    }
    return failure;
  }

  const handleUndoRemove = useCallback(async () => {
    if (
      !lastRemoved ||
      lastRemoved.invoiceId !== activeInvoice.current?.id ||
      isSaving ||
      selectionPending.current
    )
      return;
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
      note: item.note,
    });
    selectionPending.current = false;
    if (!error) {
      setLastRemoved(null);
      setNoticeMessage(`Đã khôi phục dòng “${item.productName}”`);
      document
        .querySelector<HTMLInputElement>('[data-product-input="true"]')
        ?.focus({ preventScroll: true });
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
        <header className="page-header invoice-screen-header">
          <div className="invoice-heading-row">
            <h1>{invoice?.status === "completed" ? "Chi tiết hóa đơn" : "Tạo hóa đơn mới"}</h1>
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
            {onToggleCalculator && (
              <QuickCalculatorButton isOpen={isCalculatorOpen} onToggle={onToggleCalculator} />
            )}
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
              onBlur={saveCustomer}
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
              onBlur={saveCustomer}
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
              onBlur={saveCustomer}
            />
          </div>
        </section>
        {invoice?.status === "draft" &&
          customerDirty &&
          !isSaving &&
          actions.updateInvoiceCustomer && (
            <button type="button" onClick={saveCustomer}>
              Lưu thông tin khách hàng
            </button>
          )}
        <InvoiceLineItems
          key={`${invoice?.id}:${gridReset}`}
          onPendingInputChange={setHasPendingInput}
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
          <div className="invoice-old-debt-field">
            <label htmlFor="invoice-old-debt">Nợ cũ (₫)</label>
            <CurrencyInput
              id="invoice-old-debt"
              className="invoice-customer-input"
              disabled={!invoice || isCompleting || isOverwriting}
              value={oldDebtInput}
              aria-invalid={Boolean(oldDebtError)}
              aria-describedby={oldDebtError ? "old-debt-error" : undefined}
              onChange={(event) => {
                handleOldDebtChange(event.target.value);
              }}
              onBlur={() => {
                if (!oldDebtError && Number(oldDebtInput.replace(/\./g, "") || 0) === 0)
                  setOldDebtInput("");
                saveOldDebt();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setOldDebtInput(invoice?.oldDebt ? String(invoice.oldDebt) : "");
                  setOldDebtError(null);
                }
              }}
            />
            {oldDebtError && (
              <small id="old-debt-error" role="alert">
                {oldDebtError}
              </small>
            )}
            {oldDebtDirty &&
              invoice?.status === "draft" &&
              !isSaving &&
              !oldDebtError &&
              actions.updateInvoiceOldDebt && (
                <button type="button" onClick={saveOldDebt}>
                  Lưu nợ cũ
                </button>
              )}
          </div>
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
                  disabled={
                    isSaving || !invoice.items.length || hasPendingInput || Boolean(oldDebtError)
                  }
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
                  hasPendingInput ||
                  Boolean(oldDebtError)
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
                  {drafts.length > 0 && <span className="drafts-modal-badge">{drafts.length}</span>}
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
                {drafts.length === 0 ? (
                  <div className="drafts-empty-state">
                    <InvoiceIcon name="receipt" size={32} />
                    <p>Chưa có bản nháp nào được lưu.</p>
                  </div>
                ) : (
                  <ul className="drafts-list" role="list" id="panel-drafts">
                    {drafts.map((d) => {
                      const isCurrent = d.id === invoice?.id;
                      const customerData = getSavedCustomer(d.id, d);
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
            address: invoice?.customerAddress ?? undefined,
            note: customerNote,
          }}
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          onConfirmPrinted={actions.markInvoicePrinted ? handleConfirmPrinted : undefined}
          onNewDraft={() => {
            setIsReceiptModalOpen(false);
            void handleCreateNewDraft();
          }}
        />
      </main>
    </div>
  );

  async function handleConfirmPrinted(): Promise<string | null> {
    const current = activeInvoice.current;
    if (!current || !actions.markInvoicePrinted) return "Hóa đơn chưa sẵn sàng.";
    if (current.isPrinted) return null;
    const printedAt = new Date().toISOString();
    try {
      const result = await actions.markInvoicePrinted.execute({ invoiceId: current.id, printedAt });
      if (!result.ok) return "Chưa lưu được trạng thái đã in. Vui lòng thử lại.";
      if (isMounted.current && activeInvoice.current?.id === current.id) {
        updateInvoice(activeInvoice.current.markPrinted(printedAt));
        setOriginalCompletedInvoice((previous) =>
          previous?.id === current.id ? previous.markPrinted(printedAt) : previous,
        );
        void refreshInvoices();
      }
      return null;
    } catch {
      return "Chưa lưu được trạng thái đã in. Vui lòng thử lại.";
    }
  }
}

function getSavedCustomer(
  invoiceId: string,
  inv?: Invoice | null,
  pendingOnly = false,
): { name?: string; phone?: string; address?: string; note?: string } | null {
  if (inv && (inv.customerName || inv.customerPhone || inv.customerNote)) {
    return {
      name: inv.customerName ?? undefined,
      phone: inv.customerPhone ?? undefined,
      note: inv.customerNote ?? undefined,
    };
  }
  try {
    const raw = localStorage.getItem(`smart_invoice_customer_${invoiceId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const fields = parsed as Record<string, unknown>;
    if (pendingOnly && fields.pending !== true) return null;
    if (
      ["name", "phone", "address", "note"].some(
        (key) => fields[key] != null && typeof fields[key] !== "string",
      )
    )
      return null;
    return {
      name: typeof fields.name === "string" ? fields.name : undefined,
      phone: typeof fields.phone === "string" ? fields.phone : undefined,
      address: typeof fields.address === "string" ? fields.address : undefined,
      note: typeof fields.note === "string" ? fields.note : undefined,
    };
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
