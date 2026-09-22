/// <reference types="node" />

import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { KiotVietXlsxProductSpreadsheetParser } from "./KiotVietXlsxProductSpreadsheetParser";

describe("KiotVietXlsxProductSpreadsheetParser", () => {
  it("reads the first worksheet, shared strings, optional fields, and ignores empty rows", async () => {
    const result = await new KiotVietXlsxProductSpreadsheetParser().parse(
      workbookFixture({ includeUnitColumn: true }),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          sourceRowNumber: 2,
          sku: "TL027",
          name: "Bút bi TL027",
          salePrice: 3500,
          unitName: "Cây",
          baseUnitSku: null,
          brand: "Thiên Long",
          categoryPath: "VPP>>Viết",
          conversionRatio: 1,
          isActive: true,
        },
      ],
    });
  });

  it("reports missing required columns before preview", async () => {
    const result = await new KiotVietXlsxProductSpreadsheetParser().parse(
      workbookFixture({ includeUnitColumn: false }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "missing_columns",
        message: "Thiếu cột bắt buộc: ĐVT.",
        missingColumns: ["ĐVT"],
      },
    });
  });

  it("reads Deflate-compressed XLSX entries used by real KiotViet exports", async () => {
    const result = await new KiotVietXlsxProductSpreadsheetParser().parse(
      workbookFixture({ includeUnitColumn: true, compressionMethod: 8 }),
    );

    expect(result.ok && result.value).toHaveLength(1);
  });

  it("returns a user-facing error for invalid XLSX bytes", async () => {
    const result = await new KiotVietXlsxProductSpreadsheetParser().parse(
      new TextEncoder().encode("not a zip").buffer,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_workbook",
        message: "Không thể đọc file XLSX. Hãy chọn file KiotViet hợp lệ.",
      },
    });
  });
});

function workbookFixture(options: {
  readonly includeUnitColumn: boolean;
  readonly compressionMethod?: 0 | 8;
}): ArrayBuffer {
  const headers = [
    "Mã hàng",
    "Tên hàng",
    "Giá bán",
    ...(options.includeUnitColumn ? ["ĐVT"] : []),
    "Mã ĐVT Cơ bản",
    "Thương hiệu",
    "Nhóm hàng(3 Cấp)",
    "Quy đổi",
    "Đang kinh doanh",
  ];
  const values = [
    "TL027",
    "Bút bi TL027",
    3500,
    ...(options.includeUnitColumn ? ["Cây"] : []),
    "",
    "Thiên Long",
    "VPP>>Viết",
    1,
    1,
  ];
  const sharedValues = [
    ...headers,
    ...values.filter((value): value is string => typeof value === "string"),
  ];
  const sharedIndex = new Map(sharedValues.map((value, index) => [value, index]));
  const cells = values
    .map((value, index) => {
      const reference = `${columnName(index)}2`;
      return typeof value === "number"
        ? `<c r="${reference}"><v>${value}</v></c>`
        : `<c r="${reference}" t="s"><v>${sharedIndex.get(value)}</v></c>`;
    })
    .join("");
  const headerCells = headers
    .map(
      (value, index) => `<c r="${columnName(index)}1" t="s"><v>${sharedIndex.get(value)}</v></c>`,
    )
    .join("");

  return storedZip(
    {
      "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/products.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sharedValues.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}</sst>`,
      "xl/worksheets/products.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${headerCells}</row><row r="2">${cells}</row><row r="3"><c r="A3" t="s"><v>${sharedIndex.get("")}</v></c></row></sheetData></worksheet>`,
    },
    options.compressionMethod,
  );
}

function storedZip(
  files: Readonly<Record<string, string>>,
  compressionMethod: 0 | 8 = 0,
): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const rawData = encoder.encode(text);
    const data = compressionMethod === 8 ? deflateRawSync(rawData) : rawData;
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, compressionMethod, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, rawData.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, compressionMethod, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, rawData.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralOffset = localOffset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return concat([...localParts, ...centralParts, end]).buffer;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
