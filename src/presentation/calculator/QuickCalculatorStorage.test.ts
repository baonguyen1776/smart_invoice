import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_QUICK_CALCULATOR_SNAPSHOT,
  QUICK_CALCULATOR_HISTORY_LIMIT,
  QUICK_CALCULATOR_STORAGE_KEY,
  loadQuickCalculatorSnapshot,
  saveQuickCalculatorSnapshot,
} from "./QuickCalculatorStorage";

describe("QuickCalculatorStorage", () => {
  beforeEach(() => localStorage.clear());

  it("persists expression, result and bounded history", () => {
    const history = Array.from({ length: QUICK_CALCULATOR_HISTORY_LIMIT + 5 }, (_, index) => ({
      expression: `${index} + 1`,
      result: index + 1,
      createdAt: new Date(2026, 8, 25, 12, index).toISOString(),
    }));
    saveQuickCalculatorSnapshot({ expression: "2 + 3", result: 5, history }, localStorage);

    const loaded = loadQuickCalculatorSnapshot(localStorage);
    expect(loaded.expression).toBe("2 + 3");
    expect(loaded.result).toBe(5);
    expect(loaded.history).toHaveLength(QUICK_CALCULATOR_HISTORY_LIMIT);
  });

  it("falls back safely when stored JSON is corrupt", () => {
    localStorage.setItem(QUICK_CALCULATOR_STORAGE_KEY, "{broken");
    expect(loadQuickCalculatorSnapshot(localStorage)).toEqual(EMPTY_QUICK_CALCULATOR_SNAPSHOT);
  });
});
