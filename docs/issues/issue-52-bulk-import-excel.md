# Issue #52 — Bulk Import Products from Excel/CSV

## 1. Overview & Problem Statement

Currently, adding products to the catalog requires manual data entry row by row through the "Manage Products" UI (`UC-02`). For store owners onboarding existing catalogs (often hundreds or thousands of SKUs from previous systems, distributor price lists, or spreadsheets), this manual process is time-consuming and introduces friction.

**Goal:** Provide an **"Import from Excel"** (`Nhập từ Excel`) capability in the Product Management toolbar that:
1. Allows downloading a standard Excel template (`.xlsx`) with sample data.
2. Accepts `.xlsx`, `.xls`, and `.csv` files.
3. Parses and previews imported rows in a modal, validating business rules (non-empty trimmed names, unique units per product, integer VND prices ≥ 0, optional unique SKUs).
4. Supports multi-unit products grouped by identical SKU or product name.
5. Persists validated items atomically in SQLite within a single transaction (`BEGIN IMMEDIATE`).
6. Refreshes the active product catalog and in-memory Fuse.js search index immediately upon completion.

---

## 2. User Story

> **As a** store owner / cashier,  
> **I want to** upload an Excel/CSV spreadsheet of my existing products and prices,  
> **So that** I can rapidly populate or update my catalog in bulk without manual retyping, accelerating daily sales operations.

---

## 3. UI/UX Flow

1. **Toolbar Button (`ProductManagement`):**
   - Place an **"Nhập từ Excel"** button next to "Thêm sản phẩm".
   - Include a secondary link/button: **"Tải file mẫu (.xlsx)"** with standardized columns.
2. **File Selection:**
   - Opens a file picker supporting `.xlsx`, `.xls`, `.csv`.
3. **Preview & Validation Modal:**
   - Summary counters: Total rows, valid rows (green), warning/error rows (red/amber with error descriptions).
   - Interactive preview table with columns:
     - `Mã hàng (SKU)` (optional)
     - `Tên sản phẩm` (required, non-empty)
     - `Thương hiệu` (optional)
     - `Nhóm hàng` (optional)
     - `Đơn vị tính` (required)
     - `Giá bán (VND)` (required, integer ≥ 0)
     - `Trạng thái` (Valid / Invalid with error tooltip)
   - Conflict resolution options when an SKU already exists in the database:
     - `Bỏ qua` (Skip existing products)
     - `Cập nhật` (Update price & add new units)
4. **Execution & Feedback:**
   - "Xác nhận nhập [N] sản phẩm" action button (disabled if 0 valid rows).
   - Progress indicator during parsing and persistence.
   - Success toast / notification stating how many products/units were created or updated.
   - Automatic refresh of the product table and Fuse.js search candidates.

---

## 4. Technical Architecture (4-Layer Compliance)

- **Presentation (`src/presentation`):**
  - `ProductImportButton.tsx`: Toolbar trigger and template download.
  - `ProductImportModal.tsx`: Preview table, error highlights, progress bar, conflict radio options.
- **Application (`src/application`):**
  - `ParseProductImportFileUseCase`: Transforms raw file bytes/buffer into structured product import DTOs.
  - `ValidateProductImportUseCase`: Enforces domain rules prior to persistence.
  - `BulkImportProductsUseCase`: Executes atomic batch persistence through `ProductRepository`.
  - Coordinates `ProductSearchIndex.refresh()` after successful database commit.
- **Domain (`src/domain`):**
  - Respects existing `Product` and `Unit` invariants:
    - Unit is owned directly by Product (no shared unit master table, no conversion factors).
    - Each product must retain ≥ 1 active unit.
    - Prices must be non-negative integer VND (`integer VND >= 0`), floating-point money is forbidden.
    - Product names are required and trimmed.
    - Multiple rows with the same SKU (or same name if no SKU) map to multiple `Unit` records of one `Product`.
- **Infrastructure (`src/infrastructure`):**
  - Excel parser: `xlsx` (SheetJS) or Tauri native file reader.
  - SQLite persistence: Atomic batch execution within `BEGIN IMMEDIATE ... COMMIT` to prevent partial catalog corruption.

---

## 5. Acceptance Criteria

- [ ] **AC-1:** "Nhập từ Excel" button and "Tải file mẫu" link exist in the Product Management toolbar.
- [ ] **AC-2:** Downloaded sample template contains required column headers, correct data types, and 2-3 realistic sample rows.
- [ ] **AC-3:** Parses `.xlsx`, `.xls`, and `.csv` files up to 2,000 rows without blocking the UI.
- [ ] **AC-4:** Groups multiple rows sharing the same SKU or product name into a single Product with multiple Units.
- [ ] **AC-5:** Validation highlights errors clearly (missing name, invalid price, duplicate unit name under same product).
- [ ] **AC-6:** All database writes occur within a single atomic SQLite transaction with full rollback on fatal error.
- [ ] **AC-7:** In-memory Fuse.js search index refreshes immediately so new products appear in invoice autocomplete (`UC-01`).
- [ ] **AC-8:** Automated checks pass: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

