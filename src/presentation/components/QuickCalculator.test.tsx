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

  it("accepts digits and shifted multiplication from the physical keyboard", () => {
    const { container } = render(<QuickCalculatorPanel isOpen onClose={vi.fn()} />);
    const input = screen.getByLabelText("Biểu thức tính");

    fireEvent.keyDown(window, { key: "5" });
    fireEvent.keyDown(window, { key: "6" });
    fireEvent.keyDown(window, { key: "*", code: "Digit8", shiftKey: true });
    fireEvent.keyDown(window, { key: "2" });

    expect(input).toHaveValue("56 × 2");
    expect(container.querySelector(".quick-calculator-result")).toBeNull();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(input).toHaveValue("56 × 2");
    expect(container.querySelector(".quick-calculator-result")).toHaveTextContent("112");
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

  it("moves the panel when its header is dragged and clamps it to the viewport", () => {
    const { container } = render(<QuickCalculatorPanel isOpen onClose={vi.fn()} />);
    const panel = container.querySelector<HTMLElement>(".quick-calculator-panel");
    const header = container.querySelector<HTMLElement>(".quick-calculator-header");
    expect(panel).not.toBeNull();
    expect(header).not.toBeNull();
    if (!panel || !header) return;

    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 390 });
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 500 });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 600,
      y: 68,
      left: 600,
      top: 68,
      right: 990,
      bottom: 568,
      width: 390,
      height: 500,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 620, clientY: 88 });
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 120, clientY: 120 });

    expect(panel.style.left).toBe("100px");
    expect(panel.style.top).toBe("100px");
  });
});
