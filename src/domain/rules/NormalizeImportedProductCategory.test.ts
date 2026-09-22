import { describe, expect, it } from "vitest";
import { normalizeImportedProductCategory } from "./NormalizeImportedProductCategory";

describe("normalizeImportedProductCategory", () => {
  it("removes the generic VPP root when a specific category follows", () => {
    expect(normalizeImportedProductCategory("VPP>>Viết")).toBe("Viết");
    expect(normalizeImportedProductCategory(" VPP >> Bìa hồ sơ ")).toBe("Bìa hồ sơ");
  });

  it("keeps and joins meaningful category hierarchy", () => {
    expect(normalizeImportedProductCategory("Sách>>Anh Văn>>Cấp 1")).toBe("Sách Anh Văn Cấp 1");
    expect(normalizeImportedProductCategory("Sách>>Bộ>>Cấp 2")).toBe("Sách Bộ Cấp 2");
  });

  it("keeps a standalone root and maps empty paths to null", () => {
    expect(normalizeImportedProductCategory("VPP")).toBe("VPP");
    expect(normalizeImportedProductCategory(" >> ")).toBeNull();
    expect(normalizeImportedProductCategory(null)).toBeNull();
  });
});
