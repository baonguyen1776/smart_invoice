import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Invoice } from "../../domain/entities/Invoice";
import type { ListInvoices } from "../../application/use-cases/ListInvoices";
import type { MarkInvoicePrinted } from "../../application/use-cases/MarkInvoicePrinted";
import type { PrintInvoiceReceipt } from "../../application/use-cases/PrintInvoiceReceipt";
import { InvoiceIcon } from "../components/InvoiceIcon";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { InvoiceReceiptPreviewModal } from "../components/InvoiceReceiptPreviewModal";
import { QuickCalculatorButton } from "../components/QuickCalculator";
import { normalizeCatalogSearchText } from "../../domain/rules/NormalizeCatalogSearchText";
import "./InvoiceHistoryScreen.css";

export interface InvoiceHistoryActions {
  readonly listInvoices: Pick<ListInvoices, "execute">;
  readonly markInvoicePrinted?: Pick<MarkInvoicePrinted, "execute">;
  readonly printInvoice?: Pick<PrintInvoiceReceipt, "execute">;
}

export interface InvoiceHistoryScreenProps {
  readonly actions: InvoiceHistoryActions;
  readonly activeScreen?: "invoice" | "products" | "history";
  readonly onNavigate?: (screen: "invoice" | "products" | "history") => void;
  readonly onSelectInvoiceForEdit?: (invoice: Invoice) => void;
  readonly isCalculatorOpen?: boolean;
  readonly onToggleCalculator?: () => void;
}

type DateFilterPreset = "all" | "today" | "week" | "month" | "custom";

export function InvoiceHistoryScreen({
  actions,
  activeScreen = "history",
  onNavigate,
  onSelectInvoiceForEdit,
  isCalculatorOpen = false,
  onToggleCalculator,
}: InvoiceHistoryScreenProps) {
  const [invoices, setInvoices] = useState<readonly Invoice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPreset, setFilterPreset] = useState<DateFilterPreset>("all");
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState<boolean>(false);

  // Calendar navigation month/year
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date());

  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const dateFilterBtnRef = useRef<HTMLButtonElement | null>(null);

  // Tải danh sách hóa đơn đã hoàn tất
  const fetchInvoices = useCallback(() => {
    const request = ++loadRequest.current;
    return Promise.resolve()
      .then(() => actions.listInvoices.execute({ status: "completed" }))
      .then((result) => {
        if (request !== loadRequest.current) return;
        if (!result.ok) {
          setLoadError("Không thể tải lịch sử hóa đơn. Vui lòng thử lại.");
          return;
        }
        setLoadError(null);
        setInvoices(
          [...result.value].sort((a, b) => {
            const timeA = new Date(a.completedAt || a.createdAt).getTime();
            const timeB = new Date(b.completedAt || b.createdAt).getTime();
            return timeB - timeA || b.invoiceNumber - a.invoiceNumber;
          }),
        );
      })
      .catch(() => {
        if (request === loadRequest.current)
          setLoadError("Không thể tải lịch sử hóa đơn. Vui lòng thử lại.");
      })
      .finally(() => {
        if (request === loadRequest.current) setIsLoading(false);
      });
  }, [actions.listInvoices]);

  useEffect(() => {
    void fetchInvoices();
    return () => {
      loadRequest.current += 1;
    };
  }, [fetchInvoices]);

  // Đóng calendar khi click ngoài hoặc nhấn Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isCalendarOpen &&
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(event.target as Node) &&
        dateFilterBtnRef.current &&
        !dateFilterBtnRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isCalendarOpen) {
        setIsCalendarOpen(false);
        dateFilterBtnRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCalendarOpen]);

  // Lọc theo từ khóa tìm kiếm & ngày
  const filteredInvoices = useMemo(() => {
    const rawQuery = searchQuery.trim().toLowerCase();
    const normQuery = normalizeCatalogSearchText(searchQuery);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    return invoices.filter((invoice) => {
      // 1. Lọc từ khóa: mã HĐ, tên khách (có dấu & không dấu), số điện thoại
      if (rawQuery) {
        const customer = getInvoiceCustomer(invoice);
        const code = String(invoice.invoiceNumber);
        const paddedCode = `#${code.padStart(6, "0")}`.toLowerCase();
        const rawCode = `#${code}`.toLowerCase();
        const rawName = customer.name.toLowerCase();
        const normName = normalizeCatalogSearchText(customer.name);
        const phone = (customer.phone || "").toLowerCase();

        const matchesQuery =
          paddedCode.includes(rawQuery) ||
          rawCode.includes(rawQuery) ||
          code.includes(rawQuery) ||
          rawName.includes(rawQuery) ||
          (normQuery.length > 0 && normName.includes(normQuery)) ||
          phone.includes(rawQuery);

        if (!matchesQuery) return false;
      }

      // 2. Lọc ngày
      const invoiceTime = new Date(invoice.completedAt || invoice.createdAt).getTime();

      if (filterPreset === "today") {
        return invoiceTime >= startOfToday && invoiceTime < endOfToday;
      }
      if (filterPreset === "week") {
        return invoiceTime >= startOfWeek && invoiceTime < endOfToday;
      }
      if (filterPreset === "month") {
        return invoiceTime >= startOfMonth && invoiceTime < endOfMonth;
      }
      if (filterPreset === "custom" && customDate) {
        const startOfCustom = new Date(
          customDate.getFullYear(),
          customDate.getMonth(),
          customDate.getDate(),
        ).getTime();
        const endOfCustom = new Date(
          customDate.getFullYear(),
          customDate.getMonth(),
          customDate.getDate() + 1,
        ).getTime();
        return invoiceTime >= startOfCustom && invoiceTime < endOfCustom;
      }

      return true;
    });
  }, [invoices, searchQuery, filterPreset, customDate]);

  // Xử lý in hóa đơn từ preview modal
  const handleConfirmPrinted = useCallback(async (): Promise<string | null> => {
    if (!selectedInvoice || !actions.markInvoicePrinted) return "Hóa đơn chưa sẵn sàng.";
    if (selectedInvoice.isPrinted) return null;
    const invoiceId = selectedInvoice.id;
    const printedAt = new Date().toISOString();
    try {
      const result = await actions.markInvoicePrinted.execute({ invoiceId, printedAt });
      if (!result.ok) return "Chưa lưu được trạng thái đã in. Vui lòng thử lại.";
      setSelectedInvoice((current) =>
        current?.id === invoiceId ? current.markPrinted(printedAt) : current,
      );
      setInvoices((current) =>
        current.map((item) => (item.id === invoiceId ? item.markPrinted(printedAt) : item)),
      );
      return null;
    } catch {
      return "Chưa lưu được trạng thái đã in. Vui lòng thử lại.";
    }
  }, [selectedInvoice, actions.markInvoicePrinted]);

  const handlePrintInvoice = useCallback(
    async (invoiceId: string) => {
      if (!actions.printInvoice)
        return {
          ok: false as const,
          failure: { kind: "unknown" as const, message: "PrintInvoiceReceipt not configured" },
        };
      const result = await actions.printInvoice.execute(invoiceId);
      if (result.ok) {
        const printedAt = new Date().toISOString();
        setSelectedInvoice((current) =>
          current?.id === invoiceId ? current.markPrinted(printedAt) : current,
        );
        setInvoices((current) =>
          current.map((item) => (item.id === invoiceId ? item.markPrinted(printedAt) : item)),
        );
      }
      return result;
    },
    [actions.printInvoice],
  );

  // Xử lý chuyển sang sửa hóa đơn
  const handleEditInvoice = useCallback(
    (inv: Invoice) => {
      setIsReceiptOpen(false);
      onSelectInvoiceForEdit?.(inv);
      onNavigate?.("invoice");
    },
    [onSelectInvoiceForEdit, onNavigate],
  );

  // Label hiển thị trên nút lọc ngày
  const dateFilterLabel = useMemo(() => {
    if (filterPreset === "today") return "Hôm nay";
    if (filterPreset === "week") return "7 ngày qua";
    if (filterPreset === "month") return "Tháng này";
    if (filterPreset === "custom" && customDate) {
      const d = String(customDate.getDate()).padStart(2, "0");
      const m = String(customDate.getMonth() + 1).padStart(2, "0");
      const y = customDate.getFullYear();
      return `${d}/${m}/${y}`;
    }
    return "Tất cả ngày";
  }, [filterPreset, customDate]);

  // Dữ liệu hiển thị của Calendar Popover
  const calendarDays = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = CN, 1 = T2
    // Chuyển 0 (CN) thành 6 để T2 là 0
    const startOffset = (firstDayIndex + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      day: number | null;
      date: Date | null;
      isWeekend: boolean;
      isSelected: boolean;
    }> = [];

    // Empty offset cells
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, date: null, isWeekend: false, isSelected: false });
    }

    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isSelected =
        filterPreset === "custom" &&
        customDate !== null &&
        customDate.getFullYear() === year &&
        customDate.getMonth() === month &&
        customDate.getDate() === d;

      cells.push({ day: d, date, isWeekend, isSelected });
    }

    return cells;
  }, [calendarViewDate, filterPreset, customDate]);

  function handleSelectCustomDate(date: Date) {
    setCustomDate(date);
    setFilterPreset("custom");
    setIsCalendarOpen(false);
  }

  function handlePrevMonth() {
    setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <div className="history-screen-frame">
      <WorkspaceSidebar activeScreen={activeScreen} onNavigate={onNavigate} />

      <main className="history-main-content">
        {/* Header Controls */}
        <header className="history-header">
          <div className="history-search-wrapper">
            <input
              type="text"
              className="history-search-input"
              placeholder="Tìm kiếm hóa đơn theo mã số, tên khách hàng, SĐT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm kiếm hóa đơn"
            />
            <span className="history-search-icon">
              <InvoiceIcon name="search" size={20} />
            </span>
          </div>

          <div className="history-actions">
            {onToggleCalculator && (
              <QuickCalculatorButton isOpen={isCalculatorOpen} onToggle={onToggleCalculator} />
            )}
            <button
              ref={dateFilterBtnRef}
              type="button"
              className={`history-date-filter-btn ${isCalendarOpen ? "active" : ""}`}
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              aria-expanded={isCalendarOpen}
              aria-label="Lọc theo ngày"
            >
              <InvoiceIcon name="calendar" size={18} />
              <span>{dateFilterLabel}</span>
              <InvoiceIcon name="chevron-down" size={14} />
            </button>

            {/* Calendar Popover */}
            {isCalendarOpen && (
              <div
                ref={calendarPopoverRef}
                className="history-calendar-popover"
                role="dialog"
                aria-label="Bộ lọc ngày"
              >
                <div className="calendar-header">
                  <span className="calendar-month">
                    Tháng {calendarViewDate.getMonth() + 1}, {calendarViewDate.getFullYear()}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="cal-nav-btn"
                      onClick={handlePrevMonth}
                      aria-label="Tháng trước"
                    >
                      &lt;
                    </button>
                    <button
                      type="button"
                      className="cal-nav-btn"
                      onClick={handleNextMonth}
                      aria-label="Tháng sau"
                    >
                      &gt;
                    </button>
                  </div>
                </div>

                <div className="calendar-grid">
                  <div className="cal-day-name">T2</div>
                  <div className="cal-day-name">T3</div>
                  <div className="cal-day-name">T4</div>
                  <div className="cal-day-name">T5</div>
                  <div className="cal-day-name">T6</div>
                  <div className="cal-day-name">T7</div>
                  <div className="cal-day-name weekend">CN</div>

                  {calendarDays.map((cell, idx) => {
                    if (cell.day === null || !cell.date) {
                      return <div key={`empty-${idx}`} className="cal-date empty" />;
                    }
                    return (
                      <button
                        key={`day-${cell.day}`}
                        type="button"
                        className={`cal-date ${cell.isWeekend ? "weekend" : ""} ${
                          cell.isSelected ? "selected" : ""
                        }`}
                        onClick={() => handleSelectCustomDate(cell.date!)}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Presets */}
                <div className="quick-presets">
                  <button
                    type="button"
                    className={`preset-chip ${filterPreset === "today" ? "active" : ""}`}
                    onClick={() => {
                      setFilterPreset("today");
                      setIsCalendarOpen(false);
                    }}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    className={`preset-chip ${filterPreset === "week" ? "active" : ""}`}
                    onClick={() => {
                      setFilterPreset("week");
                      setIsCalendarOpen(false);
                    }}
                  >
                    7 ngày
                  </button>
                  <button
                    type="button"
                    className={`preset-chip ${filterPreset === "month" ? "active" : ""}`}
                    onClick={() => {
                      setFilterPreset("month");
                      setIsCalendarOpen(false);
                    }}
                  >
                    Tháng này
                  </button>
                  <button
                    type="button"
                    className={`preset-chip ${filterPreset === "all" ? "active" : ""}`}
                    onClick={() => {
                      setFilterPreset("all");
                      setIsCalendarOpen(false);
                    }}
                  >
                    Tất cả
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Invoices Table Container */}
        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>Mã hóa đơn</th>
                <th>Ngày tạo</th>
                <th>Tên khách hàng</th>
                <th>Số tiền</th>
                <th style={{ textAlign: "center" }}>Trạng thái in</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => {
                const isSelected = selectedInvoice?.id === inv.id;
                const customer = getInvoiceCustomer(inv);
                return (
                  <tr
                    key={inv.id}
                    className={isSelected ? "active-row" : ""}
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setIsReceiptOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedInvoice(inv);
                        setIsReceiptOpen(true);
                      }
                    }}
                  >
                    <td className="col-invoice-num">
                      #{String(inv.invoiceNumber).padStart(6, "0")}
                    </td>
                    <td className="col-invoice-date">
                      {formatDateTime(inv.completedAt || inv.createdAt)}
                    </td>
                    <td className="col-invoice-customer">
                      {customer.name}
                      {customer.phone && (
                        <span className="customer-phone-sub">{customer.phone}</span>
                      )}
                    </td>
                    <td className={`col-invoice-amount ${inv.total < 0 ? "is-negative" : ""}`}>
                      {formatCurrency(inv.total)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`history-badge-pill ${inv.isPrinted ? "printed" : "unprinted"}`}
                      >
                        {inv.isPrinted ? "Đã in" : "Chưa in"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Loading State */}
          {isLoading && (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <InvoiceIcon name="history" size={28} />
              </div>
              <h4>Đang tải danh sách hóa đơn…</h4>
              <p>Vui lòng đợi trong giây lát.</p>
            </div>
          )}

          {/* Empty State */}
          {loadError && (
            <div role="alert">
              <p>{loadError}</p>
              <button
                disabled={isLoading}
                onClick={() => {
                  setIsLoading(true);
                  void fetchInvoices();
                }}
              >
                Thử lại
              </button>
            </div>
          )}
          {!isLoading && !loadError && filteredInvoices.length === 0 && (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <InvoiceIcon name="history" size={28} />
              </div>
              <h4>Không tìm thấy hóa đơn nào</h4>
              <p>
                {searchQuery || filterPreset !== "all"
                  ? "Không có hóa đơn nào khớp với bộ lọc hoặc từ khóa tìm kiếm của bạn."
                  : "Chưa có hóa đơn bán hàng nào được hoàn thành trong hệ thống."}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Invoice A5 Receipt Preview Modal (Original Tiệm THU BA Format) */}
      <InvoiceReceiptPreviewModal
        invoice={selectedInvoice}
        customer={
          selectedInvoice
            ? (() => {
                const c = getInvoiceCustomer(selectedInvoice);
                return {
                  name: c.isRetail ? undefined : c.name,
                  phone: c.phone ?? undefined,
                  address: c.address ?? undefined,
                  note: c.note ?? undefined,
                };
              })()
            : undefined
        }
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        onPrintInvoice={actions.printInvoice ? handlePrintInvoice : undefined}
        onConfirmPrinted={
          !actions.printInvoice && actions.markInvoicePrinted ? handleConfirmPrinted : undefined
        }
        onEdit={
          onSelectInvoiceForEdit && selectedInvoice
            ? () => handleEditInvoice(selectedInvoice)
            : undefined
        }
      />
    </div>
  );
}

export interface ResolvedCustomerInfo {
  readonly name: string;
  readonly isRetail: boolean;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly note?: string | null;
}

function getInvoiceCustomer(inv: Invoice): ResolvedCustomerInfo {
  if (inv.customerName && inv.customerName.trim().length > 0) {
    return {
      name: inv.customerName.trim(),
      isRetail: false,
      phone: inv.customerPhone,
      address: inv.customerAddress,
      note: inv.customerNote,
    };
  }

  try {
    const raw = localStorage.getItem(`smart_invoice_customer_${inv.id}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.name && typeof parsed.name === "string" && parsed.name.trim().length > 0) {
        return {
          name: parsed.name.trim(),
          isRetail: false,
          phone: parsed.phone || inv.customerPhone,
          address: parsed.address || inv.customerAddress,
          note: parsed.note || inv.customerNote,
        };
      }
    }
  } catch {
    // ignore parsing error
  }

  return {
    name: "(Khách lẻ)",
    isRetail: true,
    phone: inv.customerPhone,
    address: inv.customerAddress,
    note: inv.customerNote,
  };
}

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(${Math.abs(amount).toLocaleString("vi-VN")} đ)`;
  }
  return `${amount.toLocaleString("vi-VN")} đ`;
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}
