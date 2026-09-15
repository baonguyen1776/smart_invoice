import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  formatVndCurrency,
  parseVndCurrency,
  calculateNextCursorPosition,
  countDigitsBeforeCursor,
} from "../formatters/CurrencyFormatter";
import { CurrencyInput } from "./CurrencyInput";

describe("CurrencyFormatter utility", () => {
  it("formats integer numbers with dot thousands separator", () => {
    expect(formatVndCurrency(0)).toBe("0");
    expect(formatVndCurrency(100)).toBe("100");
    expect(formatVndCurrency(1000)).toBe("1.000");
    expect(formatVndCurrency(3000000)).toBe("3.000.000");
    expect(formatVndCurrency(123456789)).toBe("123.456.789");
    expect(formatVndCurrency(null)).toBe("");
    expect(formatVndCurrency(undefined)).toBe("");
    expect(formatVndCurrency("")).toBe("");
  });

  it("parses formatted currency strings to integer numbers", () => {
    expect(parseVndCurrency("0")).toBe(0);
    expect(parseVndCurrency("1.000")).toBe(1000);
    expect(parseVndCurrency("3.000.000")).toBe(3000000);
    expect(parseVndCurrency("")).toBe(0);
    expect(parseVndCurrency("abc")).toBe(0);
  });

  it("calculates next cursor position correctly when separators shift", () => {
    // Typing 5 in "3.|000" -> "35.000" (target digits before cursor: 2)
    expect(calculateNextCursorPosition("35.000", 2)).toBe(2);
    // Typing 0 at the end of "3.000" -> "30.000" (target digits before cursor: 5)
    expect(calculateNextCursorPosition("30.000", 5)).toBe(6);
    // Cursor at start (0 digits before cursor)
    expect(calculateNextCursorPosition("30.000", 0)).toBe(0);
  });

  it("counts digits before cursor correctly", () => {
    expect(countDigitsBeforeCursor("3.000.000", 0)).toBe(0);
    expect(countDigitsBeforeCursor("3.000.000", 1)).toBe(1);
    expect(countDigitsBeforeCursor("3.000.000", 2)).toBe(1); // after first dot
    expect(countDigitsBeforeCursor("3.000.000", 5)).toBe(4);
  });
});

describe("CurrencyInput component", () => {
  function TestWrapper(props: { initial?: number | string; maxSafe?: number }) {
    const [val, setVal] = useState<number | string>(props.initial ?? "");
    return (
      <div>
        <label htmlFor="money-input">Số tiền</label>
        <CurrencyInput
          id="money-input"
          aria-label="Số tiền"
          value={val}
          maxSafeValue={props.maxSafe}
          onValueChange={(formatted) => setVal(formatted)}
        />
        <span data-testid="display-val">{String(val)}</span>
      </div>
    );
  }

  it("formats live as user types digits", () => {
    render(<TestWrapper initial="" />);
    const input = screen.getByLabelText("Số tiền") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "50000" } });
    expect(input.value).toBe("50.000");
    expect(screen.getByTestId("display-val").textContent).toBe("50.000");

    fireEvent.change(input, { target: { value: "5000000" } });
    expect(input.value).toBe("5.000.000");
    expect(screen.getByTestId("display-val").textContent).toBe("5.000.000");
  });

  it("handles backspace over a separator dot without getting stuck", () => {
    render(<TestWrapper initial="3.000" />);
    const input = screen.getByLabelText("Số tiền") as HTMLInputElement;
    expect(input.value).toBe("3.000");

    // Position cursor right after dot (index 2: "3.|000")
    input.setSelectionRange(2, 2);
    fireEvent.keyDown(input, { key: "Backspace" });

    // Should delete the '3' before the dot, resulting in "0" or "000" -> "0"
    expect(input.value).toBe("0");
  });

  it("calls onValueChange callback with numeric and formatted values", () => {
    const onValChange = vi.fn();
    render(<CurrencyInput aria-label="Đơn giá" value={1000} onValueChange={onValChange} />);
    const input = screen.getByLabelText("Đơn giá") as HTMLInputElement;
    expect(input.value).toBe("1.000");

    fireEvent.change(input, { target: { value: "2500000" } });
    expect(onValChange).toHaveBeenCalledWith("2.500.000", 2500000);
  });
});
