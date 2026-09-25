import { describe, expect, it } from "vitest";
import { evaluateCalculatorExpression, formatCalculatorResult } from "./QuickCalculatorEngine";

describe("evaluateCalculatorExpression", () => {
  it("supports precedence, parentheses and Vietnamese number formatting", () => {
    expect(evaluateCalculatorExpression("500.000 − 367.000")).toBe(133000);
    expect(evaluateCalculatorExpression("1.200.000 ÷ 3")).toBe(400000);
    expect(evaluateCalculatorExpression("2 + 3 × 4")).toBe(14);
    expect(evaluateCalculatorExpression("(2 + 3) × 4")).toBe(20);
  });

  it("supports decimals, percentages and unary signs", () => {
    expect(evaluateCalculatorExpression("0,1 + 0,2")).toBe(0.3);
    expect(evaluateCalculatorExpression("250.000 × 95%")).toBe(237500);
    expect(evaluateCalculatorExpression("250.000 × (1 − 5%)")).toBe(237500);
    expect(evaluateCalculatorExpression("−(25 + 5)")).toBe(-30);
  });

  it("rejects incomplete, malformed and zero-division expressions", () => {
    expect(() => evaluateCalculatorExpression("")).toThrow("Nhập một phép tính");
    expect(() => evaluateCalculatorExpression("2 +")).toThrow("Phép tính chưa đầy đủ");
    expect(() => evaluateCalculatorExpression("(2 + 3")).toThrow("Thiếu dấu ngoặc đóng");
    expect(() => evaluateCalculatorExpression("1 ÷ 0")).toThrow("Không thể chia cho 0");
    expect(() => evaluateCalculatorExpression("abc")).toThrow("Biểu thức có ký tự không hợp lệ");
  });
});

describe("formatCalculatorResult", () => {
  it("formats results using Vietnamese separators", () => {
    expect(formatCalculatorResult(133000)).toBe("133.000");
    expect(formatCalculatorResult(12.5)).toBe("12,5");
  });
});
