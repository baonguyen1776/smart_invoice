import type { Result } from "../shared/Result";

export type ProductSpreadsheetCellValue = string | number | boolean | null;

export interface ProductSpreadsheetRow {
  readonly sourceRowNumber: number;
  readonly sku: string | null;
  readonly name: string | null;
  readonly salePrice: ProductSpreadsheetCellValue;
  readonly unitName: string | null;
  readonly baseUnitSku: string | null;
  readonly brand: string | null;
  readonly categoryPath: string | null;
  readonly conversionRatio: ProductSpreadsheetCellValue;
  readonly isActive: boolean | null;
}

export type ProductSpreadsheetParseErrorCode =
  "invalid_workbook" | "missing_columns" | "unsupported_workbook";

export interface ProductSpreadsheetParseError {
  readonly code: ProductSpreadsheetParseErrorCode;
  readonly message: string;
  readonly missingColumns?: readonly string[];
}

export interface ProductSpreadsheetParser {
  parse(
    workbookBytes: ArrayBuffer,
  ): Promise<Result<readonly ProductSpreadsheetRow[], ProductSpreadsheetParseError>>;
}
