import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
      <InvoiceIcon name="calculator" size={16} />
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
  const [hasJustEvaluated, setHasJustEvaluated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveQuickCalculatorSnapshot({ expression, result, history });
  }, [expression, history, result]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  function handleEvaluate() {
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
  }

  function appendToken(token: string, kind: "number" | "operator" | "postfix" = "number") {
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
  }

  function handleBackspace() {
    setExpression((current) => current.trimEnd().slice(0, -1));
    setError(null);
    setHasJustEvaluated(false);
  }

  function handleClear() {
    setExpression("");
    setResult(null);
    setError(null);
    setCopyMessage("Sao chép kết quả");
    setHasJustEvaluated(false);
    inputRef.current?.focus();
  }

  function handleToggleSign() {
    const source =
      hasJustEvaluated && result !== null
        ? calculatorResultToExpression(result)
        : expression.trim();
    if (!source) return;
    setExpression(`−(${source})`);
    setError(null);
    setHasJustEvaluated(false);
  }

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
    inputRef.current?.focus();
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      handleEvaluate();
    }
  }

  return (
    <section
      id="quick-calculator-panel"
      className="quick-calculator-panel"
      aria-label="Máy tính nhanh"
      hidden={!isOpen}
      onKeyDown={handlePanelKeyDown}
    >
      <header className="quick-calculator-header">
        <strong>
          <InvoiceIcon name="calculator" size={17} />
          Máy tính nhanh
        </strong>
        <button
          type="button"
          className="quick-calculator-close"
          onClick={onClose}
          aria-label="Đóng máy tính"
        >
          <InvoiceIcon name="close" size={16} />
        </button>
      </header>

      <div className="quick-calculator-body">
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
          placeholder="Ví dụ: 250.000 × (1 − 5%)"
        />

        <div className="quick-calculator-result" aria-live="polite">
          {result === null ? "0" : formatCalculatorResult(result)}
          <small>₫</small>
        </div>
        <div className="quick-calculator-message" role={error ? "alert" : undefined}>
          {error ?? "Dùng dấu phẩy cho số thập phân, ví dụ 12,5."}
        </div>

        <div className="quick-calculator-copy-row">
          <button
            type="button"
            className="quick-calculator-copy"
            onClick={() => void handleCopy()}
            disabled={result === null}
          >
            <InvoiceIcon name="copy" size={13} />
            {copyMessage}
          </button>
        </div>

        <div className="quick-calculator-parens" aria-label="Dấu ngoặc">
          <button type="button" onClick={() => appendToken("(")}>
            (
          </button>
          <button type="button" onClick={() => appendToken(")")}>
            )
          </button>
        </div>

        <div className="quick-calculator-keys">
          <button type="button" onClick={handleClear}>
            AC
          </button>
          <button type="button" onClick={handleBackspace} aria-label="Xóa ký tự cuối">
            ⌫
          </button>
          <button type="button" className="is-operator" onClick={() => appendToken("%", "postfix")}>
            %
          </button>
          <button
            type="button"
            className="is-operator"
            onClick={() => appendToken(" ÷ ", "operator")}
          >
            ÷
          </button>
          {["7", "8", "9"].map((value) => (
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
          {["4", "5", "6"].map((value) => (
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
          {["1", "2", "3"].map((value) => (
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
          <button type="button" className="is-equals" onClick={handleEvaluate}>
            =
          </button>
        </div>

        <div className="quick-calculator-history-header">
          <button
            type="button"
            className="quick-calculator-history-toggle"
            onClick={() => setIsHistoryOpen((current) => !current)}
            aria-expanded={isHistoryOpen}
          >
            <InvoiceIcon name="chevron-down" size={14} />
            Lịch sử gần đây ({history.length})
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="quick-calculator-clear-history"
              onClick={() => setHistory([])}
            >
              Xóa lịch sử
            </button>
          )}
        </div>

        {isHistoryOpen && (
          <div className="quick-calculator-history" aria-label="Lịch sử phép tính">
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
        )}
      </div>
    </section>
  );
}
