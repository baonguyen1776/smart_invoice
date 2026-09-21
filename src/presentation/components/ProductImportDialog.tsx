import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { normalizeCatalogSearchText } from "../../domain/rules/NormalizeCatalogSearchText";
import type {
  ApplyProductSpreadsheetImport,
  ProductImportDecision,
  ProductSpreadsheetImportResult,
} from "../../application/use-cases/ApplyProductSpreadsheetImport";
import type {
  PreviewProductSpreadsheetImport,
  ProductImportCandidate,
  ProductImportPreview,
  ProductImportUnitCandidate,
} from "../../application/use-cases/PreviewProductSpreadsheetImport";
import { formatVndCurrency } from "../formatters/CurrencyFormatter";
import { CurrencyInput } from "./CurrencyInput";
import { InvoiceIcon } from "./InvoiceIcon";
import "./ProductImportDialog.css";

export interface ProductImportActions {
  readonly previewProductImport: Pick<PreviewProductSpreadsheetImport, "execute">;
  readonly applyProductImport: Pick<ApplyProductSpreadsheetImport, "execute">;
}

interface ProductImportDialogProps {
  readonly actions: ProductImportActions;
  readonly onClose: () => void;
  readonly onImported: (result: ProductSpreadsheetImportResult) => void | Promise<void>;
}

export function ProductImportDialog({ actions, onClose, onImported }: ProductImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ProductImportDecision>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention" | "valid">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const fileRequest = useRef(0);
  const busyRef = useRef(false);

  const counts = useMemo(() => summarize(preview), [preview]);
  const updateTargets = Object.values(decisions)
    .filter((decision) => decision.action === "update" && decision.productId)
    .map((decision) => decision.productId);
  const hasDuplicateTargets = new Set(updateTargets).size !== updateTargets.length;
  const hasInvalidEditingPrice =
    editingPriceKey !== null && parseEditableVndPrice(priceDrafts[editingPriceKey] ?? "") === null;
  const canImport =
    preview !== null &&
    !hasDuplicateTargets &&
    !hasInvalidEditingPrice &&
    preview.candidates.some((candidate) => decisions[candidate.key]?.action !== "skip") &&
    preview.candidates.every((candidate) =>
      isCandidateResolved(candidate, decisions[candidate.key]),
    );

  const sortedCandidates = useMemo(() => {
    if (!preview) return [];
    return [...preview.candidates].sort((a, b) => {
      const priorityDiff = candidateAttentionPriority(a) - candidateAttentionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.sourceRows[0] ?? 0) - (b.sourceRows[0] ?? 0);
    });
  }, [preview]);

  const attentionCandidates = useMemo(() => {
    return sortedCandidates.filter(
      (candidate) => !isCandidateResolved(candidate, decisions[candidate.key]),
    );
  }, [sortedCandidates, decisions]);

  const validCandidates = useMemo(() => {
    return sortedCandidates.filter((candidate) =>
      isCandidateResolved(candidate, decisions[candidate.key]),
    );
  }, [sortedCandidates, decisions]);

  const displayedCandidates = useMemo(() => {
    const candidates =
      filter === "attention"
        ? attentionCandidates
        : filter === "valid"
          ? validCandidates
          : sortedCandidates;
    const search = normalizeCatalogSearchText(query);
    return candidates.filter((candidate) =>
      normalizeCatalogSearchText(
        [
          candidate.name,
          candidate.sku,
          candidate.brand,
          candidate.category,
          ...candidate.units.map((unit) => unit.sourceSku),
        ].join(" "),
      ).includes(search),
    );
  }, [filter, sortedCandidates, attentionCandidates, validCandidates, query]);
  const pageCount = Math.max(1, Math.ceil(displayedCandidates.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleCandidates = displayedCandidates.slice(currentPage * 30, (currentPage + 1) * 30);
  const skippedCount =
    preview?.candidates.filter((candidate) => decisions[candidate.key]?.action === "skip").length ??
    0;
  const priceAttentionCount =
    preview?.candidates.reduce(
      (total, candidate) =>
        total + candidate.units.filter((unit) => unit.requiresPriceDecision).length,
      0,
    ) ?? 0;
  const suggestedPriceCount =
    preview?.candidates.reduce((total, candidate) => {
      const decision = decisions[candidate.key];
      if (decision?.action === "skip") return total;
      return (
        total +
        candidate.units.filter(
          (unit) =>
            unit.suggestedPrice !== null &&
            unitNeedsAcceptedPrice(candidate, unit, decision) &&
            !isAcceptedVndPrice(decision?.acceptedPrices?.[unit.sourceRowNumber]),
        ).length
      );
    }, 0) ?? 0;
  const unresolvedPriceCount =
    preview?.candidates.reduce((total, candidate) => {
      const decision = decisions[candidate.key];
      if (decision?.action === "skip") return total;
      return (
        total +
        candidate.units.filter(
          (unit) =>
            unitNeedsAcceptedPrice(candidate, unit, decision) &&
            !isAcceptedVndPrice(decision?.acceptedPrices?.[unit.sourceRowNumber]),
        ).length
      );
    }, 0) ?? 0;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || busyRef.current) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Vui lòng chọn file KiotViet .xlsx.");
      return;
    }
    const requestId = ++fileRequest.current;
    setFileName(file.name);
    setPreview(null);
    setDecisions({});
    setError(null);
    setFilter("all");
    setQuery("");
    setPage(0);
    setPriceDrafts({});
    setEditingPriceKey(null);
    setIsParsing(true);
    try {
      const result = await actions.previewProductImport.execute(await file.arrayBuffer());
      if (requestId !== fileRequest.current) return;
      if (!result.ok) {
        setError(toImportError(result.error));
        return;
      }
      setPreview(result.value);
      setDecisions(initialDecisions(result.value));
    } catch {
      if (requestId === fileRequest.current) setError("Không thể đọc file sản phẩm.");
    } finally {
      if (requestId === fileRequest.current) setIsParsing(false);
    }
  }

  function setAction(candidate: ProductImportCandidate, action: ProductImportDecision["action"]) {
    setDecisions((current) => {
      const previous = current[candidate.key];
      const matches =
        candidate.exactMatches.length > 0
          ? candidate.exactMatches
          : candidate.possibleMatches.map((match) => match.product);
      const target = matches.length === 1 ? matches[0] : undefined;
      return {
        ...current,
        [candidate.key]: {
          ...previous,
          action,
          productId: action === "update" ? (previous?.productId ?? target?.id) : undefined,
        },
      };
    });
  }

  function setTarget(candidate: ProductImportCandidate, productId: string) {
    setDecisions((current) => ({
      ...current,
      [candidate.key]: { ...current[candidate.key], action: "update", productId },
    }));
  }

  function setAcceptedPrice(
    candidate: ProductImportCandidate,
    sourceRowNumber: number,
    price: number | null,
  ) {
    setDecisions((current) => {
      const previous = current[candidate.key] ?? { action: "pending" as const };
      const acceptedPrices = { ...previous.acceptedPrices };
      if (price === null) delete acceptedPrices[sourceRowNumber];
      else acceptedPrices[sourceRowNumber] = price;
      return {
        ...current,
        [candidate.key]: {
          ...previous,
          acceptedPrices,
        },
      };
    });
  }

  function setPriceDraft(
    candidate: ProductImportCandidate,
    sourceRowNumber: number,
    draft: string,
  ) {
    setPriceDrafts((current) => ({
      ...current,
      [priceDraftKey(candidate.key, sourceRowNumber)]: draft,
    }));
    const parsed = parseEditableVndPrice(draft);
    if (parsed !== null) setAcceptedPrice(candidate, sourceRowNumber, parsed);
  }

  function beginPriceEdit(candidate: ProductImportCandidate, unit: ProductImportUnitCandidate) {
    const key = priceDraftKey(candidate.key, unit.sourceRowNumber);
    const accepted = decisions[candidate.key]?.acceptedPrices?.[unit.sourceRowNumber];
    const currentPrice = accepted ?? unit.acceptedPrice ?? unit.sourcePrice;
    setPriceDrafts((current) => ({
      ...current,
      [key]: current[key] ?? displayEditablePrice(currentPrice),
    }));
    setEditingPriceKey(key);
  }

  function commitPriceEdit(candidate: ProductImportCandidate, unit: ProductImportUnitCandidate) {
    const key = priceDraftKey(candidate.key, unit.sourceRowNumber);
    setPriceDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setEditingPriceKey(null);
  }

  function acceptAllSuggestedPrices() {
    if (!preview) return;
    const drafts: Record<string, string> = {};
    const suggestions = new Map<string, Readonly<Record<number, number>>>();
    for (const candidate of preview.candidates) {
      const decision = decisions[candidate.key];
      if (decision?.action === "skip") continue;
      const candidateSuggestions = Object.fromEntries(
        candidate.units
          .filter(
            (unit) =>
              unit.suggestedPrice !== null &&
              unitNeedsAcceptedPrice(candidate, unit, decision) &&
              !isAcceptedVndPrice(decision?.acceptedPrices?.[unit.sourceRowNumber]),
          )
          .map((unit) => {
            drafts[priceDraftKey(candidate.key, unit.sourceRowNumber)] = String(
              unit.suggestedPrice,
            );
            return [unit.sourceRowNumber, unit.suggestedPrice!];
          }),
      );
      if (Object.keys(candidateSuggestions).length > 0) {
        suggestions.set(candidate.key, candidateSuggestions);
      }
    }
    setDecisions((current) => {
      const next = { ...current };
      for (const candidate of preview.candidates) {
        const suggested = suggestions.get(candidate.key);
        if (suggested === undefined) continue;
        const previous = next[candidate.key] ?? { action: "pending" as const };
        next[candidate.key] = {
          ...previous,
          acceptedPrices: { ...previous.acceptedPrices, ...suggested },
        };
      }
      return next;
    });
    setPriceDrafts((current) => ({ ...current, ...drafts }));
  }

  async function handleImport() {
    if (!preview || !canImport || busyRef.current) return;
    busyRef.current = true;
    setIsApplying(true);
    setError(null);
    try {
      const result = await actions.applyProductImport.execute({ preview, decisions });
      if (!result.ok) {
        setError(toImportError(result.error));
        return;
      }
      await onImported(result.value);
    } catch {
      setError("Không thể nhập danh mục sản phẩm.");
    } finally {
      busyRef.current = false;
      setIsApplying(false);
    }
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      fileRequest.current += 1;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isApplying) {
        onClose();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ) ?? [],
        ).filter((element) => getComputedStyle(element).display !== "none");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialogRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isApplying, onClose]);

  return (
    <div
      className="product-import-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isApplying) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="product-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-import-title"
      >
        <header className="product-import-header">
          <div className="product-import-title-group">
            <h2 id="product-import-title">Import sản phẩm</h2>
            <span className="product-import-badge">Bảng tính Excel</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
            disabled={isApplying}
          >
            ×
          </button>
        </header>

        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        {isParsing && (
          <div className="product-import-loading-state">
            <span className="spin-linear">
              <InvoiceIcon name="refresh" size={32} />
            </span>
            <p>Đang đọc và đối chiếu dữ liệu…</p>
          </div>
        )}

        {!preview && !isParsing && (
          <div className="product-import-empty-state">
            <div className="empty-state-card">
              <div className="empty-state-icon">
                <InvoiceIcon name="upload" size={32} />
              </div>
              <h3>Chọn file để tải lên</h3>
              <p>Hỗ trợ file danh sách sản phẩm KiotViet (.xlsx).</p>
              <label className="primary-button product-import-cta">
                <input
                  type="file"
                  accept=".xlsx"
                  aria-label="Chọn file .xlsx"
                  onChange={(event) => void handleFile(event)}
                />
                <InvoiceIcon name="plus" size={16} />
                <span>Chọn file .xlsx</span>
              </label>
            </div>
          </div>
        )}

        {preview && (
          <>
            <div className="product-import-toolbar">
              <div className="product-import-file-info">
                <InvoiceIcon name="note" size={16} />
                <span className="file-name">{fileName ?? "Đã chọn file"}</span>
                <label className="change-file-btn">
                  <input
                    type="file"
                    accept=".xlsx"
                    disabled={isApplying}
                    aria-label="Chọn file .xlsx"
                    onChange={(event) => void handleFile(event)}
                  />
                  Đổi file
                </label>
              </div>
              {suggestedPriceCount > 0 && (
                <button
                  type="button"
                  className="secondary-button compact-btn"
                  onClick={acceptAllSuggestedPrices}
                  disabled={isApplying}
                >
                  Làm tròn {suggestedPriceCount} giá
                </button>
              )}
            </div>

            <div className="product-import-metrics" aria-label="Tổng hợp preview">
              {preview.databaseProductCount !== undefined && (
                <div className="metric-chip">
                  Đã đối chiếu {preview.databaseProductCount} sản phẩm trong danh mục
                </div>
              )}
              <div className="metric-chip">
                <span className="metric-value">{preview.productCount}</span> sản phẩm
              </div>
              <div className="metric-chip">
                <span className="metric-value">{preview.unitCount}</span> đơn vị
              </div>
              <div className="metric-chip new">
                <span className="metric-value">{counts.newCount}</span> mới
              </div>
              {counts.review > 0 && (
                <div className="metric-chip review">
                  <span className="metric-value">{counts.review}</span> cần review
                </div>
              )}
              {counts.warning > 0 && (
                <div className="metric-chip warning">
                  <span className="metric-value">{counts.warning}</span> cảnh báo
                </div>
              )}
              {priceAttentionCount > 0 && (
                <div className={`metric-chip ${unresolvedPriceCount > 0 ? "warning" : "new"}`}>
                  <span className="metric-value">{unresolvedPriceCount}</span> giá chưa xác nhận
                </div>
              )}
              {counts.error > 0 && (
                <div className="metric-chip error">
                  <span className="metric-value">{counts.error}</span> lỗi
                </div>
              )}
            </div>

            <div className="import-list-controls">
              <div className="import-search-toolbar">
                <input
                  type="search"
                  aria-label="Tìm trong file import"
                  placeholder="Tìm tên, mã hàng, thương hiệu…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
                {preview.candidates.length > 0 && (
                  <div className="attention-banner-filters">
                    <button
                      type="button"
                      className={`filter-tab ${filter === "all" ? "active" : ""}`}
                      onClick={() => {
                        setFilter("all");
                        setPage(0);
                      }}
                    >
                      Tất cả ({preview.candidates.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-tab warning ${filter === "attention" ? "active" : ""}`}
                      onClick={() => {
                        setFilter("attention");
                        setPage(0);
                      }}
                    >
                      Cần xử lý ({attentionCandidates.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-tab valid ${filter === "valid" ? "active" : ""}`}
                      onClick={() => {
                        setFilter("valid");
                        setPage(0);
                      }}
                    >
                      Hợp lệ ({validCandidates.length})
                    </button>
                  </div>
                )}
              </div>
              <span className="import-list-status" role="status">
                <InvoiceIcon name="alert" size={14} />
                {attentionCandidates.length} chưa xử lý · {skippedCount} bỏ qua
              </span>
            </div>
            <p className="import-merge-note">
              Gộp giữ dữ liệu hiện có; chỉ thêm mã và đơn vị còn thiếu.
            </p>
            {hasDuplicateTargets && (
              <p role="alert" className="notice error">
                Nhiều nhóm đang gộp vào cùng một sản phẩm. Hãy bỏ qua nhóm trùng và xử lý riêng.
              </p>
            )}

            <div className="product-import-table-wrap">
              <table className="product-import-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Đơn vị / giá</th>
                    <th>Đối chiếu</th>
                    <th>Xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="import-empty-filter-cell">
                        Không có sản phẩm nào phù hợp bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    visibleCandidates.map((candidate) => {
                      const decision = decisions[candidate.key];
                      const matches =
                        candidate.exactMatches.length > 0
                          ? candidate.exactMatches
                          : candidate.possibleMatches.map((match) => match.product);
                      const selectedTarget = matches.find(
                        (product) => product.id === decision?.productId,
                      );
                      const isError = hasCandidateError(candidate);
                      const isWarning = !isError && hasCandidateWarning(candidate);
                      const rowClass = [isError ? "is-blocked" : "", isWarning ? "has-warning" : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <tr key={candidate.key} className={rowClass}>
                          <td>
                            <span className="import-prod-name">
                              {candidate.name || "Thiếu tên"}
                            </span>
                            <small>Dòng {candidate.sourceRows.join(", ")}</small>
                            <div className="import-prod-meta">
                              {candidate.sku && (
                                <span className="import-meta-tag sku">{candidate.sku}</span>
                              )}
                              {candidate.brand && (
                                <span className="import-meta-tag">{candidate.brand}</span>
                              )}
                              {candidate.category && (
                                <span className="import-meta-tag">{candidate.category}</span>
                              )}
                            </div>
                            {candidate.issues
                              .filter((issue) => !isInlinePriceIssue(issue.code))
                              .map((issue) => (
                                <span
                                  key={`${issue.code}-${issue.sourceRows.join("-")}`}
                                  className={`import-issue ${issue.severity}`}
                                >
                                  {shortIssueLabel(issue)}
                                </span>
                              ))}
                          </td>
                          <td>
                            <div className="import-unit-list">
                              {candidate.units.map((unit) => {
                                const accepted = decision?.acceptedPrices?.[unit.sourceRowNumber];
                                const editorKey = priceDraftKey(
                                  candidate.key,
                                  unit.sourceRowNumber,
                                );
                                const existingUnit =
                                  decision?.action === "update"
                                    ? selectedTarget?.units.find(
                                        (targetUnit) =>
                                          targetUnit.isActive &&
                                          normalizeCatalogSearchText(targetUnit.name) ===
                                            normalizeCatalogSearchText(unit.name),
                                      )
                                    : undefined;
                                const displayedPrice =
                                  accepted ?? unit.acceptedPrice ?? unit.sourcePrice;
                                const draft = priceDrafts[editorKey];
                                const isEditingPrice = editingPriceKey === editorKey;
                                const hasPriceWarning =
                                  (isEditingPrice &&
                                    draft !== undefined &&
                                    parseEditableVndPrice(draft) === null) ||
                                  (unitNeedsAcceptedPrice(candidate, unit, decision) &&
                                    !isAcceptedVndPrice(accepted));
                                return (
                                  <div key={unit.sourceRowNumber} className="import-unit-card">
                                    <div className="import-unit-item">
                                      <span className="import-unit-identity">
                                        <span className="import-unit-name">{unit.name}</span>
                                        <EditableUnitPrice
                                          candidate={candidate}
                                          unit={unit}
                                          value={displayedPrice}
                                          draft={
                                            priceDrafts[editorKey] ??
                                            (displayedPrice === null ? "" : String(displayedPrice))
                                          }
                                          editing={isEditingPrice}
                                          warning={hasPriceWarning}
                                          disabled={isApplying}
                                          title={
                                            existingUnit
                                              ? `Khi gộp sẽ giữ giá DB ${formatVndCurrency(existingUnit.price)}`
                                              : undefined
                                          }
                                          onStartEdit={() => beginPriceEdit(candidate, unit)}
                                          onDraftChange={(draft) =>
                                            setPriceDraft(candidate, unit.sourceRowNumber, draft)
                                          }
                                          onCommit={() => commitPriceEdit(candidate, unit)}
                                          onCancel={() => setEditingPriceKey(null)}
                                        />
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <MatchSummary candidate={candidate} selectedId={decision?.productId} />
                          </td>
                          <td>
                            {candidate.isBlocked ? (
                              <button
                                type="button"
                                disabled={isApplying}
                                onClick={() =>
                                  setAction(
                                    candidate,
                                    decision?.action === "skip" ? "pending" : "skip",
                                  )
                                }
                              >
                                {decision?.action === "skip"
                                  ? "Đã bỏ qua — hoàn tác"
                                  : "Bỏ qua dòng lỗi"}
                              </button>
                            ) : (
                              <div className="import-decision-controls">
                                {candidate.matchKind === "new" ? (
                                  <select
                                    disabled={isApplying}
                                    aria-label={`Quyết định cho ${candidate.name}`}
                                    value={decision?.action ?? "create"}
                                    onChange={(event) =>
                                      setAction(
                                        candidate,
                                        event.target.value as ProductImportDecision["action"],
                                      )
                                    }
                                  >
                                    <option value="create">Tạo mới</option>
                                    <option value="skip">Bỏ qua</option>
                                  </select>
                                ) : (
                                  <select
                                    aria-label={`Quyết định cho ${candidate.name}`}
                                    value={decision?.action ?? "pending"}
                                    disabled={isApplying}
                                    onChange={(event) =>
                                      setAction(
                                        candidate,
                                        event.target.value as ProductImportDecision["action"],
                                      )
                                    }
                                  >
                                    <option value="pending">Chọn thao tác</option>
                                    {candidate.matchKind !== "inactive-sku" && (
                                      <option value="update">Gộp</option>
                                    )}
                                    {candidate.matchKind === "possible-duplicate" && (
                                      <option value="create">Tạo riêng</option>
                                    )}
                                    <option value="skip">Bỏ qua</option>
                                  </select>
                                )}
                                {decision?.action === "update" && matches.length > 1 && (
                                  <select
                                    disabled={isApplying}
                                    aria-label={`Sản phẩm đích cho ${candidate.name}`}
                                    value={decision.productId ?? ""}
                                    onChange={(event) => setTarget(candidate, event.target.value)}
                                  >
                                    <option value="">Chọn sản phẩm đích</option>
                                    {matches.map((product) => (
                                      <option
                                        key={product.id}
                                        value={product.id}
                                        disabled={!product.isActive}
                                      >
                                        {product.name} ({product.sku ?? "không SKU"})
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="import-pagination">
              <span>
                {displayedCandidates.length} kết quả · Trang {currentPage + 1}/{pageCount}
              </span>
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Trang sau
              </button>
            </div>
          </>
        )}

        <footer className="product-import-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={isApplying}
          >
            Hủy
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canImport || isApplying}
            onClick={() => void handleImport()}
          >
            {isApplying
              ? "Đang import…"
              : `Nhập ${(preview?.productCount ?? 0) - skippedCount} sản phẩm`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function MatchSummary({
  candidate,
  selectedId,
}: {
  readonly candidate: ProductImportCandidate;
  readonly selectedId?: string;
}) {
  const targets =
    candidate.exactMatches.length > 0
      ? candidate.exactMatches
      : candidate.possibleMatches.map((match) => match.product);
  const selected = targets.find((product) => product.id === selectedId);
  if (candidate.matchKind === "new") return <span className="match-badge new">Không trùng</span>;
  return (
    <div className="import-match-list">
      {targets.map((product) => {
        const match = candidate.possibleMatches.find((item) => item.product.id === product.id);
        return (
          <details
            key={product.id}
            className="match-details"
            open={selected?.id === product.id || undefined}
          >
            <summary>
              {match ? `${match.score}/100 — ` : "Khớp mã — "}
              {product.name}
            </summary>
            <small>
              {product.sku ?? "Không có SKU"} · {product.brand ?? "Chưa có thương hiệu"} ·{" "}
              {product.category ?? "Chưa có nhóm"}
              {!product.isActive && " · Đã ngừng bán"}
            </small>
            {product.units
              .filter((unit) => unit.isActive)
              .map((unit) => (
                <small key={unit.id}>
                  Giá đang có: {unit.name} — {formatVndCurrency(unit.price)}
                </small>
              ))}
            {match?.evidence.map((item, index) => (
              <small key={index} className={item.points < 0 ? "import-conflict" : ""}>
                {item.points > 0 ? "+" : ""}
                {item.points}: {item.explanation} ({item.imported} / {item.existing})
              </small>
            ))}
          </details>
        );
      })}
    </div>
  );
}

function EditableUnitPrice({
  candidate,
  unit,
  value,
  draft,
  editing,
  warning,
  disabled,
  title,
  onStartEdit,
  onDraftChange,
  onCommit,
  onCancel,
}: {
  readonly candidate: ProductImportCandidate;
  readonly unit: ProductImportUnitCandidate;
  readonly value: number | null;
  readonly draft: string;
  readonly editing: boolean;
  readonly warning: boolean;
  readonly disabled: boolean;
  readonly title?: string;
  readonly onStartEdit: () => void;
  readonly onDraftChange: (draft: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}) {
  const inputLabel = `Giá nhập cho ${candidate.name} - ${unit.name}`;
  if (editing) {
    return (
      <span className="import-unit-price-wrap" title={title}>
        <span className="import-unit-price-editor">
          <span className="import-unit-price-measure" aria-hidden="true">
            {draft || "\u00a0"}
          </span>
          <CurrencyInput
            className="import-unit-price-input"
            autoFocus
            value={draft}
            disabled={disabled}
            aria-label={inputLabel}
            onValueChange={(formatted) => onDraftChange(formatted)}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </span>
        {warning && (
          <span className="import-price-warning" aria-label="Giá cần xử lý" title="Giá cần xử lý">
            ⚠️
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className="import-unit-price-wrap"
      title={title ?? "Double-click để sửa giá"}
      onDoubleClick={() => {
        if (!disabled) onStartEdit();
      }}
    >
      <span className="import-unit-price">{displayPrice(value)}</span>
      {warning && (
        <span className="import-price-warning" aria-label="Giá cần xử lý" title="Giá cần xử lý">
          ⚠️
        </span>
      )}
    </span>
  );
}

function initialDecisions(preview: ProductImportPreview): Record<string, ProductImportDecision> {
  return Object.fromEntries(
    preview.candidates
      .filter((candidate) => !candidate.isBlocked && candidate.matchKind === "new")
      .map((candidate) => [candidate.key, { action: "create" as const }]),
  );
}

function isCandidateResolved(
  candidate: ProductImportCandidate,
  decision: ProductImportDecision | undefined,
): boolean {
  if (decision === undefined) return false;
  if (decision.action === "skip") return true;
  if (candidate.isBlocked || decision.action === "pending") return false;
  if (
    decision.action === "update" &&
    ![...candidate.exactMatches, ...candidate.possibleMatches.map((match) => match.product)].some(
      (product) => product.id === decision.productId && product.isActive,
    )
  )
    return false;
  return candidate.units.every(
    (unit) =>
      !unitNeedsAcceptedPrice(candidate, unit, decision) ||
      isAcceptedVndPrice(decision.acceptedPrices?.[unit.sourceRowNumber]),
  );
}

function unitNeedsAcceptedPrice(
  candidate: ProductImportCandidate,
  unit: ProductImportUnitCandidate,
  decision: ProductImportDecision | undefined,
): boolean {
  if (!unit.requiresPriceDecision) return false;
  if (decision?.action !== "update" || decision.productId === undefined) return true;
  const target = [
    ...candidate.exactMatches,
    ...candidate.possibleMatches.map((match) => match.product),
  ].find((product) => product.id === decision.productId);
  return !target?.units.some(
    (targetUnit) =>
      targetUnit.isActive &&
      normalizeCatalogSearchText(targetUnit.name) === normalizeCatalogSearchText(unit.name),
  );
}

function isAcceptedVndPrice(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function priceDraftKey(candidateKey: string, sourceRowNumber: number): string {
  return `${candidateKey}:${sourceRowNumber}`;
}

function shortIssueLabel(issue: ProductImportCandidate["issues"][number]): string {
  const labels: Partial<Record<typeof issue.code, string>> = {
    missing_sku: "Thiếu mã",
    missing_name: "Thiếu tên",
    missing_unit: "Thiếu đơn vị",
    invalid_price: "Giá lỗi",
    fractional_price: "Giá lẻ",
    zero_price: "Giá 0",
    duplicate_sku: "Trùng mã trong file",
    missing_base_product: "Thiếu sản phẩm gốc",
    duplicate_unit: "Trùng đơn vị",
    metadata_mismatch: "Thông tin đơn vị lệch",
    inactive_source_row: "Ngừng bán",
  };
  return labels[issue.code] ?? issue.message;
}

function isInlinePriceIssue(code: ProductImportCandidate["issues"][number]["code"]): boolean {
  return code === "invalid_price" || code === "fractional_price" || code === "zero_price";
}

function summarize(preview: ProductImportPreview | null) {
  if (!preview) return { newCount: 0, review: 0, warning: 0, error: 0 };
  return {
    newCount: preview.candidates.filter((candidate) => candidate.matchKind === "new").length,
    review: preview.candidates.filter((candidate) => candidate.matchKind !== "new").length,
    warning: preview.candidates.filter((candidate) =>
      candidate.issues.some((issue) => issue.severity === "warning"),
    ).length,
    error: preview.candidates.filter((candidate) => candidate.isBlocked).length,
  };
}

function displayPrice(price: number | null): string {
  if (price === null) return "Giá không hợp lệ";
  return Number.isInteger(price) ? formatVndCurrency(price) : `${price.toLocaleString("vi-VN")} ₫`;
}

function displayEditablePrice(price: number | null): string {
  if (price === null) return "";
  return Number.isInteger(price) ? formatVndCurrency(price) : price.toLocaleString("vi-VN");
}

function parseEditableVndPrice(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized) && !/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(/\./g, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toImportError(error: { readonly message?: string; readonly code: string }): string {
  if (typeof error.message === "string") return error.message;
  if (error.code === "sku_conflict") return "SKU đã được sản phẩm khác sử dụng.";
  if (error.code === "alias_conflict") return "Alias đã tồn tại trong sản phẩm đích.";
  return "Không thể xử lý import sản phẩm.";
}

function candidateAttentionPriority(candidate: ProductImportCandidate): number {
  if (candidate.isBlocked || candidate.issues.some((issue) => issue.severity === "error")) {
    return 0;
  }
  if (
    candidate.issues.some((issue) => issue.severity === "warning") ||
    candidate.units.some((unit) => unit.requiresPriceDecision)
  ) {
    return 1;
  }
  if (candidate.requiresDecision || candidate.matchKind !== "new") {
    return 2;
  }
  return 3;
}

function hasCandidateWarning(candidate: ProductImportCandidate): boolean {
  return (
    candidate.issues.some((issue) => issue.severity === "warning") ||
    candidate.units.some((unit) => unit.requiresPriceDecision)
  );
}

function hasCandidateError(candidate: ProductImportCandidate): boolean {
  return candidate.isBlocked || candidate.issues.some((issue) => issue.severity === "error");
}
