const MAX_CALCULATOR_MAGNITUDE = Number.MAX_SAFE_INTEGER;

export class CalculatorExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculatorExpressionError";
  }
}

export function evaluateCalculatorExpression(expression: string): number {
  const source = expression.replace(/[×xX]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-");
  const parser = new CalculatorParser(source);
  const value = parser.parse();
  if (!Number.isFinite(value) || Math.abs(value) > MAX_CALCULATOR_MAGNITUDE) {
    throw new CalculatorExpressionError("Kết quả vượt giới hạn tính toán.");
  }
  return Number(value.toPrecision(15));
}

export function formatCalculatorResult(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 6,
  }).format(value);
}

export function calculatorResultToExpression(value: number): string {
  return String(value).replace(".", ",");
}

class CalculatorParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    this.skipSpaces();
    if (this.index >= this.source.length) {
      throw new CalculatorExpressionError("Nhập một phép tính.");
    }
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index !== this.source.length) {
      throw new CalculatorExpressionError("Biểu thức có ký tự không hợp lệ.");
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      const operator = this.peek();
      if (operator !== "+" && operator !== "-") return value;
      this.index += 1;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      this.skipSpaces();
      const operator = this.peek();
      if (operator !== "*" && operator !== "/") return value;
      this.index += 1;
      const right = this.parseUnary();
      if (operator === "/" && right === 0) {
        throw new CalculatorExpressionError("Không thể chia cho 0.");
      }
      value = operator === "*" ? value * right : value / right;
    }
  }

  private parseUnary(): number {
    this.skipSpaces();
    const operator = this.peek();
    if (operator === "+" || operator === "-") {
      this.index += 1;
      const value = this.parseUnary();
      return operator === "-" ? -value : value;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): number {
    let value = this.parsePrimary();
    while (true) {
      this.skipSpaces();
      if (this.peek() !== "%") return value;
      this.index += 1;
      value /= 100;
    }
  }

  private parsePrimary(): number {
    this.skipSpaces();
    if (this.peek() === "(") {
      this.index += 1;
      const value = this.parseExpression();
      this.skipSpaces();
      if (this.peek() !== ")") {
        throw new CalculatorExpressionError("Thiếu dấu ngoặc đóng.");
      }
      this.index += 1;
      return value;
    }

    const next = this.peek();
    if (next !== undefined && !/[0-9]/.test(next)) {
      throw new CalculatorExpressionError("Biểu thức có ký tự không hợp lệ.");
    }

    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipSpaces();
    const start = this.index;
    while (/[0-9.,]/.test(this.peek() ?? "")) this.index += 1;
    if (start === this.index) {
      throw new CalculatorExpressionError("Phép tính chưa đầy đủ.");
    }
    const raw = this.source.slice(start, this.index);
    return parseLocalizedNumber(raw);
  }

  private skipSpaces() {
    while (/\s/.test(this.peek() ?? "")) this.index += 1;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }
}

function parseLocalizedNumber(raw: string): number {
  if (!/^\d[\d.,]*$/.test(raw)) {
    throw new CalculatorExpressionError("Số không hợp lệ.");
  }

  let normalized: string;
  if (raw.includes(",")) {
    const parts = raw.split(",");
    if (parts.length !== 2 || parts[1].length === 0 || !/^\d+$/.test(parts[1])) {
      throw new CalculatorExpressionError("Số thập phân không hợp lệ.");
    }
    const integerPart = normalizeGroupedInteger(parts[0]);
    normalized = `${integerPart}.${parts[1]}`;
  } else {
    const dots = (raw.match(/\./g) ?? []).length;
    if (dots === 0) {
      normalized = raw;
    } else if (dots === 1) {
      const [left, right] = raw.split(".");
      if (!right || !/^\d+$/.test(right)) {
        throw new CalculatorExpressionError("Số thập phân không hợp lệ.");
      }
      const looksGrouped = left !== "0" && left.length <= 3 && right.length === 3;
      normalized = looksGrouped ? `${left}${right}` : `${left}.${right}`;
    } else {
      normalized = normalizeGroupedInteger(raw);
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new CalculatorExpressionError("Số không hợp lệ.");
  }
  return value;
}

function normalizeGroupedInteger(raw: string): string {
  if (!raw.includes(".")) {
    if (!/^\d+$/.test(raw)) throw new CalculatorExpressionError("Số không hợp lệ.");
    return raw;
  }
  if (!/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    throw new CalculatorExpressionError("Dấu phân cách hàng nghìn không hợp lệ.");
  }
  return raw.replace(/\./g, "");
}
