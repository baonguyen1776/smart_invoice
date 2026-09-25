import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_CALCULATOR_STORAGE_KEY,
  saveQuickCalculatorSnapshot,
} from "../calculator/QuickCalculatorStorage";
import { QuickCalculatorPanel } from "./QuickCalculator";

describe("QuickCalculatorPanel", () => {
  beforeEach(() => localStorage.clear());

  it("evaluates expressions and reuses recent history", () => {
    render(<QuickCalculatorPanel isOpen onClose={vi.fn()} />);
    const input = screen.getByLabelText("Biểu thức tính");

    fireEvent.change(input, { target: { value: "250.000 × 95%" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("237.500", { exact: false })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Lịch sử gần đây/ }));
    expect(screen.getByRole("button", { name: /250.000 × 95%/ })).toBeVisible();

    const stored = localStorage.getItem(QUICK_CALCULATOR_STORAGE_KEY);
    expect(stored).toContain("250.000 × 95%");
  });

  it("closes with Escape while focus is inside the panel", () => {
    const onClose = vi.fn();
    render(<QuickCalculatorPanel isOpen onClose={onClose} />);

    fireEvent.keyDown(screen.getByLabelText("Biểu thức tính"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores the previous expression and history from local storage", () => {
    saveQuickCalculatorSnapshot(
      {
        expression: "1.200.000 ÷ 3",
        result: 400000,
        history: [
          {
            expression: "1.200.000 ÷ 3",
            result: 400000,
            createdAt: "2026-09-25T16:00:00.000Z",
          },
        ],
      },
      localStorage,
    );

    render(<QuickCalculatorPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText("Biểu thức tính")).toHaveValue("1.200.000 ÷ 3");
    expect(screen.getByText("400.000", { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: /Lịch sử gần đây \(1\)/ })).toBeVisible();
  });
});
