export const QUICK_CALCULATOR_STORAGE_KEY = "smart_invoice_quick_calculator_v1";
export const QUICK_CALCULATOR_HISTORY_LIMIT = 30;

export interface QuickCalculatorHistoryEntry {
  readonly expression: string;
  readonly result: number;
  readonly createdAt: string;
}

export interface QuickCalculatorSnapshot {
  readonly expression: string;
  readonly result: number | null;
  readonly history: readonly QuickCalculatorHistoryEntry[];
}

export const EMPTY_QUICK_CALCULATOR_SNAPSHOT: QuickCalculatorSnapshot = {
  expression: "",
  result: null,
  history: [],
};

export function loadQuickCalculatorSnapshot(
  storage?: Pick<Storage, "getItem">,
): QuickCalculatorSnapshot {
  const target = storage ?? getBrowserStorage();
  if (!target) return EMPTY_QUICK_CALCULATOR_SNAPSHOT;

  try {
    const raw = target.getItem(QUICK_CALCULATOR_STORAGE_KEY);
    if (!raw) return EMPTY_QUICK_CALCULATOR_SNAPSHOT;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY_QUICK_CALCULATOR_SNAPSHOT;

    const expression = typeof parsed.expression === "string" ? parsed.expression.slice(0, 200) : "";
    const result = isFiniteCalculatorNumber(parsed.result) ? parsed.result : null;
    const history = Array.isArray(parsed.history)
      ? parsed.history
          .filter(isHistoryEntry)
          .slice(0, QUICK_CALCULATOR_HISTORY_LIMIT)
          .map((entry) => ({
            expression: entry.expression.slice(0, 200),
            result: entry.result,
            createdAt: entry.createdAt,
          }))
      : [];
    return { expression, result, history };
  } catch {
    return EMPTY_QUICK_CALCULATOR_SNAPSHOT;
  }
}

export function saveQuickCalculatorSnapshot(
  snapshot: QuickCalculatorSnapshot,
  storage?: Pick<Storage, "setItem">,
): void {
  const target = storage ?? getBrowserStorage();
  if (!target) return;
  try {
    target.setItem(
      QUICK_CALCULATOR_STORAGE_KEY,
      JSON.stringify({
        expression: snapshot.expression.slice(0, 200),
        result: isFiniteCalculatorNumber(snapshot.result) ? snapshot.result : null,
        history: snapshot.history.slice(0, QUICK_CALCULATOR_HISTORY_LIMIT),
      }),
    );
  } catch {
    // Calculator persistence is a convenience; storage failures must not block invoice work.
  }
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteCalculatorNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  );
}

function isHistoryEntry(value: unknown): value is QuickCalculatorHistoryEntry {
  return (
    isRecord(value) &&
    typeof value.expression === "string" &&
    value.expression.length > 0 &&
    value.expression.length <= 200 &&
    isFiniteCalculatorNumber(value.result) &&
    typeof value.createdAt === "string"
  );
}
