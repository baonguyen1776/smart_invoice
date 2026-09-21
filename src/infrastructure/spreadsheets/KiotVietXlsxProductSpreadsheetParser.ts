import type {
  ProductSpreadsheetCellValue,
  ProductSpreadsheetParseError,
  ProductSpreadsheetParser,
  ProductSpreadsheetRow,
} from "../../application/ports/ProductSpreadsheetParser";
import { err, ok, type Result } from "../../application/shared/Result";

const REQUIRED_COLUMNS = ["Mã hàng", "Tên hàng", "Giá bán", "ĐVT"] as const;
const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;

interface ZipEntry {
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

interface ParsedWorksheetRow {
  readonly rowNumber: number;
  readonly cells: ReadonlyMap<number, ProductSpreadsheetCellValue>;
}

class UnsupportedWorkbookError extends Error {}

export class KiotVietXlsxProductSpreadsheetParser implements ProductSpreadsheetParser {
  async parse(
    workbookBytes: ArrayBuffer,
  ): Promise<Result<readonly ProductSpreadsheetRow[], ProductSpreadsheetParseError>> {
    try {
      const archive = new XlsxZipArchive(workbookBytes);
      const workbookXml = await archive.readText("xl/workbook.xml");
      const workbookRelationshipsXml = await archive.readText("xl/_rels/workbook.xml.rels");
      const worksheetPath = firstWorksheetPath(workbookXml, workbookRelationshipsXml);
      const sharedStrings = archive.has("xl/sharedStrings.xml")
        ? parseSharedStrings(await archive.readText("xl/sharedStrings.xml"))
        : [];
      const rows = parseWorksheet(await archive.readText(worksheetPath), sharedStrings);

      if (rows.length === 0) {
        return err({
          code: "invalid_workbook",
          message: "Bảng tính không chứa dòng tiêu đề sản phẩm.",
        });
      }

      const [headerRow, ...dataRows] = rows;
      const columns = mapColumns(headerRow.cells);
      const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.has(column));

      if (missingColumns.length > 0) {
        return err({
          code: "missing_columns",
          message: `Thiếu cột bắt buộc: ${missingColumns.join(", ")}.`,
          missingColumns,
        });
      }

      return ok(
        dataRows
          .map((row) => toProductRow(row, columns))
          .filter((row): row is ProductSpreadsheetRow => row !== null),
      );
    } catch (error) {
      if (error instanceof UnsupportedWorkbookError) {
        return err({ code: "unsupported_workbook", message: error.message });
      }

      return err({
        code: "invalid_workbook",
        message: "Không thể đọc file XLSX. Hãy chọn file KiotViet hợp lệ.",
      });
    }
  }
}

class XlsxZipArchive {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly entries: ReadonlyMap<string, ZipEntry>;

  constructor(workbookBytes: ArrayBuffer) {
    this.bytes = new Uint8Array(workbookBytes);
    this.view = new DataView(workbookBytes);
    this.entries = this.readCentralDirectory();
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  async readText(path: string): Promise<string> {
    const bytes = await this.read(path);
    return new TextDecoder("utf-8").decode(bytes);
  }

  private async read(path: string): Promise<Uint8Array> {
    const entry = this.entries.get(path);
    if (entry === undefined) throw new Error(`Missing XLSX entry: ${path}`);
    if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new UnsupportedWorkbookError(
        "Một thành phần trong file XLSX quá lớn để xử lý an toàn.",
      );
    }

    const offset = entry.localHeaderOffset;
    if (this.readUint32(offset) !== 0x04034b50) throw new Error("Invalid ZIP local header");
    const fileNameLength = this.readUint16(offset + 26);
    const extraLength = this.readUint16(offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.bytes.length) throw new Error("Invalid ZIP entry bounds");

    const compressed = this.bytes.slice(dataStart, dataEnd);
    if (entry.compressionMethod === 0) return compressed;
    if (entry.compressionMethod !== 8) {
      throw new UnsupportedWorkbookError("File XLSX sử dụng kiểu nén chưa được hỗ trợ.");
    }

    if (typeof DecompressionStream === "undefined") {
      throw new UnsupportedWorkbookError("Thiết bị hiện tại không hỗ trợ giải nén file XLSX.");
    }

    try {
      const decompressor = new DecompressionStream("deflate-raw" as CompressionFormat);
      const compressedStream = new Response(compressed).body;
      if (compressedStream === null) throw new Error("Compressed stream is unavailable");
      const stream = compressedStream.pipeThrough(decompressor);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new UnsupportedWorkbookError(
        "Không thể giải nén nội dung file XLSX trên thiết bị này.",
      );
    }
  }

  private readCentralDirectory(): ReadonlyMap<string, ZipEntry> {
    const endOffset = this.findEndOfCentralDirectory();
    const entryCount = this.readUint16(endOffset + 10);
    let offset = this.readUint32(endOffset + 16);
    const entries = new Map<string, ZipEntry>();

    for (let index = 0; index < entryCount; index += 1) {
      if (this.readUint32(offset) !== 0x02014b50) throw new Error("Invalid ZIP directory");

      const fileNameLength = this.readUint16(offset + 28);
      const extraLength = this.readUint16(offset + 30);
      const commentLength = this.readUint16(offset + 32);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > this.bytes.length) throw new Error("Invalid ZIP file name");

      const path = new TextDecoder("utf-8").decode(this.bytes.slice(nameStart, nameEnd));
      entries.set(path, {
        compressionMethod: this.readUint16(offset + 10),
        compressedSize: this.readUint32(offset + 20),
        uncompressedSize: this.readUint32(offset + 24),
        localHeaderOffset: this.readUint32(offset + 42),
      });
      offset = nameEnd + extraLength + commentLength;
    }

    return entries;
  }

  private findEndOfCentralDirectory(): number {
    const minimumOffset = Math.max(0, this.bytes.length - 65_557);
    for (let offset = this.bytes.length - 22; offset >= minimumOffset; offset -= 1) {
      if (this.readUint32(offset) === 0x06054b50) return offset;
    }
    throw new Error("ZIP directory was not found");
  }

  private readUint16(offset: number): number {
    if (offset < 0 || offset + 2 > this.view.byteLength) throw new Error("Invalid ZIP offset");
    return this.view.getUint16(offset, true);
  }

  private readUint32(offset: number): number {
    if (offset < 0 || offset + 4 > this.view.byteLength) throw new Error("Invalid ZIP offset");
    return this.view.getUint32(offset, true);
  }
}

function firstWorksheetPath(workbookXml: string, relationshipsXml: string): string {
  const workbook = parseXml(workbookXml);
  const firstSheet = elementsByLocalName(workbook, "sheet")[0];
  const relationshipId = firstSheet?.getAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "id",
  );
  if (!relationshipId) throw new Error("Workbook has no worksheet");

  const relationships = parseXml(relationshipsXml);
  const relationship = elementsByLocalName(relationships, "Relationship").find(
    (candidate) => candidate.getAttribute("Id") === relationshipId,
  );
  const target = relationship?.getAttribute("Target");
  if (!target) throw new Error("Worksheet relationship is missing");

  return resolveZipPath("xl/workbook.xml", target);
}

function parseSharedStrings(xml: string): readonly string[] {
  return elementsByLocalName(parseXml(xml), "si").map((item) =>
    elementsByLocalName(item, "t")
      .map((text) => text.textContent ?? "")
      .join(""),
  );
}

function parseWorksheet(
  xml: string,
  sharedStrings: readonly string[],
): readonly ParsedWorksheetRow[] {
  const worksheet = parseXml(xml);
  return elementsByLocalName(worksheet, "row")
    .map((row): ParsedWorksheetRow => {
      const cells = new Map<number, ProductSpreadsheetCellValue>();
      for (const cell of directChildrenByLocalName(row, "c")) {
        const reference = cell.getAttribute("r");
        if (!reference) continue;
        cells.set(columnIndex(reference), parseCell(cell, sharedStrings));
      }

      return {
        rowNumber: Number(row.getAttribute("r") ?? 0),
        cells,
      };
    })
    .filter((row) => [...row.cells.values()].some((value) => !isBlank(value)));
}

function parseCell(cell: Element, sharedStrings: readonly string[]): ProductSpreadsheetCellValue {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return elementsByLocalName(cell, "t")
      .map((text) => text.textContent ?? "")
      .join("");
  }

  const raw = directChildrenByLocalName(cell, "v")[0]?.textContent ?? null;
  if (raw === null) return null;
  if (type === "s") return sharedStrings[Number(raw)] ?? null;
  if (type === "b") return raw === "1";
  if (type === "str" || type === "e") return raw;

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function mapColumns(cells: ReadonlyMap<number, ProductSpreadsheetCellValue>): Map<string, number> {
  const columns = new Map<string, number>();
  for (const [index, value] of cells) {
    if (typeof value !== "string") continue;
    const name = value
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " ")
      .normalize("NFC");
    if (name.length > 0) columns.set(name, index);
  }
  return columns;
}

function toProductRow(
  row: ParsedWorksheetRow,
  columns: ReadonlyMap<string, number>,
): ProductSpreadsheetRow | null {
  const value = (column: string): ProductSpreadsheetCellValue => {
    const index = columns.get(column);
    return index === undefined ? null : (row.cells.get(index) ?? null);
  };
  const values = [value("Mã hàng"), value("Tên hàng"), value("Giá bán"), value("ĐVT")];
  if (values.every(isBlank)) return null;

  return {
    sourceRowNumber: row.rowNumber,
    sku: toOptionalText(value("Mã hàng")),
    name: toOptionalText(value("Tên hàng")),
    salePrice: value("Giá bán"),
    unitName: toOptionalText(value("ĐVT")),
    baseUnitSku: toOptionalText(value("Mã ĐVT Cơ bản")),
    brand: toOptionalText(value("Thương hiệu")),
    categoryPath: toOptionalText(value("Nhóm hàng(3 Cấp)")),
    conversionRatio: value("Quy đổi"),
    isActive: toOptionalBoolean(value("Đang kinh doanh")),
  };
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (elementsByLocalName(document, "parsererror").length > 0) {
    throw new Error("Invalid XML");
  }
  return document;
}

function elementsByLocalName(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function directChildrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function resolveZipPath(basePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseSegments = basePath.split("/");
  baseSegments.pop();
  for (const segment of target.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") baseSegments.pop();
    else baseSegments.push(segment);
  }
  return baseSegments.join("/");
}

function columnIndex(cellReference: string): number {
  const letters = /^[A-Z]+/i.exec(cellReference)?.[0];
  if (!letters) throw new Error("Invalid cell reference");

  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function toOptionalText(value: ProductSpreadsheetCellValue): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function toOptionalBoolean(value: ProductSpreadsheetCellValue): boolean | null {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

function isBlank(value: ProductSpreadsheetCellValue): boolean {
  return value === null || (typeof value === "string" && value.trim().length === 0);
}
