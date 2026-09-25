import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { InvoiceIcon } from "./InvoiceIcon";
import {
  calculatorResultToExpression,
  evaluateCalculatorExpression,
  formatCalculatorResult,
} from "../calculator/QuickCalculatorEngine";
import {
  QUICK_CALCULATOR_HISTORY_LIMIT,
  loadQuickCalculatorSnapshot,
  saveQuickCalculatorSnapshot,
  type QuickCalculatorHistoryEntry,
} from "../calculator/QuickCalculatorStorage";
import "./QuickCalculator.css";

const PANEL_VIEWPORT_GAP = 12;

interface PanelPosition {
  readonly x: number;
  readonly y: number;
}

interface DragState {
  readonly pointerId: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface QuickCalculatorButtonProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

export function QuickCalculatorButton({ isOpen, onToggle }: QuickCalculatorButtonProps) {
  return (
    <button
      type="button"
      className={`quick-calculator-trigger ${isOpen ? "is-open" : ""}`}
      aria-expanded={isOpen}
      aria-controls="quick-calculator-panel"
      onClick={onToggle}
    >
      <InvoiceIcon name="calculator" size={17} />
      <span>Máy tính</span>
    </button>
  );
}

export interface QuickCalculatorPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function QuickCalculatorPanel({ isOpen, onClose }: QuickCalculatorPanelProps) {
  const [initial] = useState(loadQuickCalculatorSnapshot);
  const [expression, setExpression] = useState(initial.expression);
  const [result, setResult] = useState<number | null>(initial.result);
  const [history, setHistory] = useState<readonly QuickCalculatorHistoryEntry[]>(initial.history);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("Sao chép kết quả");
  const [hasJustEvaluated, setHasJustEvaluated] = useState(initial.result !== null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    saveQuickCalculatorSnapshot({ expression, result, history });
  }, [expression, history, result]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  const handleEvaluate = useCallback(() => {
    try {
      const nextResult = evaluateCalculatorExpression(expression);
      const entry: QuickCalculatorHistoryEntry = {
        expression: expression.trim(),
        result: nextResult,
        createdAt: new Date().toISOString(),
      };
      setResult(nextResult);
      setHistory((current) =>
        [
          entry,
          ...current.filter(
            (item) => item.expression !== entry.expression || item.result !== entry.result,
          ),
        ].slice(0, QUICK_CALCULATOR_HISTORY_LIMIT),
      );
      setError(null);
      setCopyMessage("Sao chép kết quả");
      setHasJustEvaluated(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tính biểu thức này.");
      setHasJustEvaluated(false);
    }
  }, [expression]);

  const appendToken = useCallback(
    (token: string, kind: "number" | "operator" | "postfix" = "number") => {
      setError(null);
      setCopyMessage("Sao chép kết quả");
      setExpression((current) => {
        if (hasJustEvaluated && result !== null) {
          if (kind === "operator" || kind === "postfix") {
            return `${calculatorResultToExpression(result)}${token}`;
          }
          return token;
        }
        return `${current}${token}`;
      });
      setHasJustEvaluated(false);
    },
    [hasJustEvaluated, result],
  );

  const handleBackspace = useCallback(() => {
    setExpression((current) => current.trimEnd().slice(0, -1));
    setError(null);
    setHasJustEvaluated(false);
  }, []);

  const handleClear = useCallback(() => {
    setExpression("");
    setResult(null);
    setError(null);
    setCopyMessage("Sao chép kết quả");
    setHasJustEvaluated(false);
    inputRef.current?.focus();
  }, []);

  const handleToggleSign = useCallback(() => {
    const source =
      hasJustEvaluated && result !== null
        ? calculatorResultToExpression(result)
        : expression.trim();
    if (!source) return;
    setExpression(`−(${source})`);
    setError(null);
    setHasJustEvaluated(false);
  }, [expression, hasJustEvaluated, result]);

  useEffect(() => {
    if (!isOpen) return;

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const panel = panelRef.current;
      const activeElement = document.activeElement;
      const calculatorOwnsKeyboard =
        !activeElement ||
        activeElement === document.body ||
        activeElement === document.documentElement ||
        Boolean(panel?.contains(activeElement));
      if (!calculatorOwnsKeyboard) return;

      let handled = true;
      if (/^\d$/.test(event.key)) appendToken(event.key);
      else if (event.key === "," || event.key === ".") appendToken(",");
      else if (event.key === "+") appendToken(" + ", "operator");
      else if (event.key === "-") appendToken(" − ", "operator");
      else if (event.key === "*") appendToken(" × ", "operator");
      else if (event.key === "/") appendToken(" ÷ ", "operator");
      else if (event.key === "%") appendToken("%", "postfix");
      else if (event.key === "(" || event.key === ")") appendToken(event.key);
      else if (event.key === "Enter" || event.key === "=") handleEvaluate();
      else if (event.key === "Backspace") handleBackspace();
      else if (event.key === "Escape") onClose();
      else handled = false;

      if (!handled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [appendToken, handleBackspace, handleEvaluate, isOpen, onClose]);

  useEffect(() => {
    if (!position) return;
    function clampAfterResize() {
      const panel = panelRef.current;
      if (!panel) return;
      setPosition((current) => (current ? clampPosition(current.x, current.y, panel) : current));
    }
    window.addEventListener("resize", clampAfterResize);
    return () => window.removeEventListener("resize", clampAfterResize);
  }, [position]);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    setPosition((current) => (current ? clampPosition(current.x, current.y, panel) : current));
  }, [isHistoryOpen]);

  async function handleCopy() {
    if (result === null) return;
    try {
      await navigator.clipboard.writeText(formatCalculatorResult(result));
      setCopyMessage("Đã sao chép");
    } catch {
      setCopyMessage("Không thể sao chép");
    }
  }

  function handleReuse(entry: QuickCalculatorHistoryEntry) {
    setExpression(entry.expression);
    setResult(entry.result);
    setError(null);
    setHasJustEvaluated(true);
    setIsHistoryOpen(false);
    inputRef.current?.focus();
  }

  function handleDragStart(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleDragMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragStateRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    setPosition(clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY, panel));
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  const panelStyle = position
    ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto" }
    : undefined;

  return (
    <section
      ref={panelRef}
      id="quick-calculator-panel"
      className={`quick-calculator-panel ${isHistoryOpen ? "is-history-open" : ""}`}
      aria-label="Máy tính nhanh"
      hidden={!isOpen}
      style={panelStyle}
    >
      <header
        className="quick-calculator-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <strong>
          <InvoiceIcon name="calculator" size={18} />
          Máy tính nhanh
        </strong>
        <div className="quick-calculator-header-actions">
          {history.length > 0 && (
            <button
              type="button"
              className={`quick-calculator-history-toggle ${isHistoryOpen ? "is-open" : ""}`}
              onClick={() => setIsHistoryOpen((current) => !current)}
              aria-label={isHistoryOpen ? "Ẩn lịch sử phép tính" : "Hiện lịch sử phép tính"}
              aria-expanded={isHistoryOpen}
              aria-controls="quick-calculator-history-panel"
              title="Lịch sử phép tính"
            >
              <InvoiceIcon name="history" size={18} />
              <span>{history.length}</span>
            </button>
          )}
          <button
            type="button"
            className="quick-calculator-close"
            onClick={onClose}
            aria-label="Đóng máy tính"
          >
            <InvoiceIcon name="close" size={18} />
          </button>
        </div>
      </header>

      <div className="quick-calculator-layout">
        {isHistoryOpen && (
          <aside
            id="quick-calculator-history-panel"
            className="quick-calculator-history-panel"
            aria-label="Lịch sử phép tính"
          >
            <div className="quick-calculator-history-header">
              <div>
                <strong>Lịch sử</strong>
                <span>{history.length}</span>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  className="quick-calculator-clear-history"
                  onClick={() => {
                    setHistory([]);
                    setIsHistoryOpen(false);
                  }}
                >
                  Xóa
                </button>
              )}
            </div>

            <div className="quick-calculator-history">
              {history.length === 0 ? (
                <p>Chưa có phép tính nào.</p>
              ) : (
                history.map((entry) => (
                  <button
                    type="button"
                    key={`${entry.createdAt}-${entry.expression}`}
                    onClick={() => handleReuse(entry)}
                  >
                    <span>{entry.expression}</span>
                    <strong>{formatCalculatorResult(entry.result)}</strong>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        <div className="quick-calculator-body">
          <div className={`quick-calculator-display ${hasJustEvaluated ? "is-evaluated" : ""}`}>
            <label className="sr-only" htmlFor="quick-calculator-expression">
              Biểu thức tính
            </label>
            <input
              id="quick-calculator-expression"
              ref={inputRef}
              className="quick-calculator-expression"
              value={expression}
              onChange={(event) => {
                setExpression(event.target.value.slice(0, 200));
                setError(null);
                setHasJustEvaluated(false);
              }}
              autoComplete="off"
              spellCheck={false}
              inputMode="decimal"
              placeholder="0"
            />
            {hasJustEvaluated && result !== null && (
              <output className="quick-calculator-result" aria-live="polite">
                {formatCalculatorResult(result)}
              </output>
            )}
          </div>

          {error && (
            <div className="quick-calculator-message" role="alert">
              {error}
            </div>
          )}

          <div className="quick-calculator-copy-row">
            <button
              type="button"
              className="quick-calculator-copy"
              onClick={() => void handleCopy()}
              disabled={result === null || !hasJustEvaluated}
              aria-label={copyMessage}
              title={copyMessage}
            >
              <InvoiceIcon name="copy" size={15} />
            </button>
          </div>

          <div className="quick-calculator-functions">
            <button type="button" onClick={() => appendToken("(")}>
              (
            </button>
            <button type="button" onClick={() => appendToken(")")}>
              )
            </button>
            <button type="button" onClick={handleClear}>
              AC
            </button>
            <button type="button" onClick={handleBackspace} aria-label="Xóa ký tự cuối">
              ⌫
            </button>
            <button type="button" onClick={() => appendToken("%", "postfix")}>
              %
            </button>
            <button
              type="button"
              className="is-operator"
              onClick={() => appendToken(" ÷ ", "operator")}
            >
              ÷
            </button>
          </div>

          <div className="quick-calculator-keys">
            {(["7", "8", "9"] as const).map((value) => (
              <button type="button" key={value} onClick={() => appendToken(value)}>
                {value}
              </button>
            ))}
            <button
              type="button"
              className="is-operator"
              onClick={() => appendToken(" × ", "operator")}
            >
              ×
            </button>
            {(["4", "5", "6"] as const).map((value) => (
              <button type="button" key={value} onClick={() => appendToken(value)}>
                {value}
              </button>
            ))}
            <button
              type="button"
              className="is-operator"
              onClick={() => appendToken(" − ", "operator")}
            >
              −
            </button>
            {(["1", "2", "3"] as const).map((value) => (
              <button type="button" key={value} onClick={() => appendToken(value)}>
                {value}
              </button>
            ))}
            <button
              type="button"
              className="is-operator"
              onClick={() => appendToken(" + ", "operator")}
            >
              +
            </button>
            <button type="button" onClick={handleToggleSign}>
              +/−
            </button>
            <button type="button" onClick={() => appendToken("0")}>
              0
            </button>
            <button type="button" onClick={() => appendToken(",")}>
              ,
            </button>
            <button type="button" className="is-operator is-equals" onClick={handleEvaluate}>
              =
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function clampPosition(x: number, y: number, panel: HTMLElement): PanelPosition {
  const bounds = panel.getBoundingClientRect();
  const width = panel.offsetWidth || bounds.width;
  const height = panel.offsetHeight || bounds.height;
  return {
    x: Math.min(
      Math.max(PANEL_VIEWPORT_GAP, x),
      Math.max(PANEL_VIEWPORT_GAP, window.innerWidth - width - PANEL_VIEWPORT_GAP),
    ),
    y: Math.min(
      Math.max(PANEL_VIEWPORT_GAP, y),
      Math.max(PANEL_VIEWPORT_GAP, window.innerHeight - height - PANEL_VIEWPORT_GAP),
    ),
  };
}
