# Issue verification

Requirements: [architecture](../architecture.md), [NFRs](../non-functional-requirements.md).
This file records verification evidence; open work is tracked on GitHub.

## #4 — SQLite Product repository

[Issue #4](https://github.com/baonguyen1776/smart_invoice/issues/4) — local checks passed; remaining limits below.

- Product CRUD uses typed Tauri commands and one sqlx pool; generic SQL webview permissions are disabled. The SQL plugin is registered but unused by this path.
- Transactions preserve Product/Unit ownership, active Units, soft-deactivated history, and atomic name swaps. Missing updates/deactivations fail; corrupt reads return safe errors.
- Migration `0002` adds integer guards and Unicode unique indexes without editing `0001`. Incompatible existing data blocks migration without automatic repair.
- Tests cover fresh/upgrade/repeated migration, CRUD, duplicate names/SKUs, Unicode names, and rollback after a partial write. Rollback assertions read both tables directly.

### Results — 2026-09-09

- Frontend: 69 tests passed; typecheck, lint, build, format passed.
- Rust: 14 tests passed; fmt and Clippy (all targets, warnings denied) passed. The opt-in release benchmark passed separately.
- Native Tauri/Wry smoke: 21/21 launches passed using real IPC and production command handlers. One write launch plus 20 restarts preserved price, deactivation and list filters; TypeScript rehydration is tested separately.

Release benchmark: macOS 26.6.2, Apple M5 (10 logical CPUs), 16 GiB RAM; disposable file-backed SQLite, caches not flushed. Seed: 10,000 Products/50,000 Units; creates add 101 five-Unit Products, then deactivate them. One untimed CRUD iteration and catalog read warm the paths. Writes include commit; reads include Rust mapping. P95 uses nearest rank; median uses the upper middle sample.

| Operation | Samples | Median ms | P95 ms | Max ms |
| --- | --- | --- | --- | --- |
| Get Product + 5 Units | 100 | 0.056 | 0.068 | 0.130 |
| Create Product + 5 Units | 100 | 0.526 | 0.747 | 5.496 |
| Update Product + 5 Units | 100 | 0.487 | 0.676 | 12.289 |
| Deactivate | 100 | 0.346 | 0.551 | 3.322 |
| Load 10,000 active Products + 50,000 Units | 20 | 135.339 | 138.932 | 140.358 |
| SQLite reopen, same process | 20 | 0.180 | 0.264 | 0.456 |
| SQLite reopen, fresh native process (1 Product) | 20 | 0.444 | 0.530 | 0.546 |

These samples meet the corresponding repository/startup budgets. First-install schema creation took 3.605 ms in one native launch. Timings exclude IPC, TypeScript, rendering and search-index construction; SQLite initialization also excludes process/webview startup.

### Remaining limits

- Lock wait measured 2.0985 s with `busy_timeout = 2000` ms. The test allows 2.5 s for scheduling overhead; the approved strict 2 s end-to-end ceiling is **not demonstrated**.
- Full search-index timing, Windows/Linux, minimum-spec hardware, app cold-start, power-loss and installer tests remain unverified. These local results do not close every NFR gate.
- Native smoke retained a separate macOS Application Support profile: `com.smartinvoice.smoke.run1788938374824`; the normal app profile was untouched.

## #5 — Product Domain and use cases

[Issue #5](https://github.com/baonguyen1776/smart_invoice/issues/5) — historical completion evidence: 64 tests across 4 files passed, plus typecheck/lint/build/format and diff checks.

TDD covered missing Product factories (6 initial failures), duplicate Unit IDs (1 failure), missing use cases, and invalid runtime Unit input (4 failures), then passed after implementation. Tests verify normalization, validation, typed errors, reconciliation, visibility and idempotent deactivation. Numeric coverage was not measured; SQLite belongs to #4.

## #13 — Product Management UI

[Issue #13](https://github.com/baonguyen1776/smart_invoice/issues/13) — implementation checks passed on 2026-09-09.

- Product Management loads only active Products through `ListProducts` and displays SKU, brand, category, active Units, and integer-VND prices.
- Create/edit forms call Application use cases, support multiple owned Units, and preserve soft-deactivation semantics when an existing Unit is removed.
- Product deactivation requires explicit confirmation and calls `DeactivateProduct`; no hard-delete path was added.
- Presentation tests cover catalog disambiguation, create input mapping, last-active-Unit protection, duplicate-SKU messaging, and deactivation confirmation.
- Frontend: 73 tests across 6 files passed; typecheck, lint, build, format, and diff checks passed.

Manual Tauri verification at 1366×768 and a complete keyboard-only pass remain to be recorded before marking the issue Done.

## #15 — SQLite Invoice repository and draft persistence

[Issue #15](https://github.com/baonguyen1776/smart_invoice/issues/15) — implementation checks passed on 2026-09-10.

- Persists UC-01 Invoice draft creation, atomic sequential invoice number assignment (`MAX + 1`), semantic item updates, completion, and confirmed completed overwrites.
- All write operations execute within `BEGIN IMMEDIATE` transactions, ensuring all-or-nothing atomicity and ACID compliance.
- Recalculates and validates invoice totals from item subtotals using checked arithmetic; rejects arithmetic overflow, safe integer limit violations (> 9,007,199,254,740,991), and mismatched totals with complete rollback.
- Reads invoice header and items within a single read transaction in `fetch_invoice` to guarantee snapshot consistency.
- Validates draft UUID v4 identity and canonical ISO-8601 UTC timestamps before committing any draft rows.
- Enforces Product–Unit ownership for every InvoiceItem during write transactions with complete rollback on mismatch, while preserving inactive catalog records for historical consistency.
- Historical InvoiceItem display data is read strictly from snapshot columns, preserved even when catalog Product/Unit records are subsequently modified.
- TypeScript repository adapter (`SQLiteInvoiceRepository`) cleanly implements the Application `InvoiceRepository` port, mapping infrastructure errors to `InvoicePersistenceFailure` without leaking database internals.
- Verification:
  - Frontend: 112 tests across 10 files passed; typecheck, lint, build, format, and diff checks passed.
  - Rust: 27 tests passed; fmt and Clippy (all targets, warnings denied) passed.

## #16 — ProductAlias persistence and Fuse.js catalog search

[Issue #16](https://github.com/baonguyen1776/smart_invoice/issues/16) — implementation checks passed on 2026-09-10.

- Migration `0003_product_aliases.sql` adds the documented ProductAlias fields,
  Product foreign-key restriction, per-Product/per-source uniqueness, and
  global/source-scoped lookup indexes without modifying earlier migrations.
- Canonical search normalization is NFKD, Vietnamese-locale lowercase, `đ`
  folding, combining-mark removal, punctuation-to-space conversion, trimming,
  and whitespace collapse. Tests cover Vietnamese aliases and persistence
  rehydration integrity.
- The application loads active Products and aliases once, checks exact Product
  ID/SKU before Fuse.js fuzzy candidates, and never queries repositories per
  keystroke after readiness. Candidates retain Product SKU/brand/category and
  active Unit context so duplicate names remain distinguishable.
- Product and alias use cases refresh the in-memory index only after committed
  create/edit/deactivate/create-alias/remove-alias writes. Inactive Products are
  excluded from exact lookup, fuzzy results, and new-invoice selection.
- Fuse.js `7.5.0` is the documented/approved search implementation; no other
  dependency was introduced.
- Frontend: 124 tests across 14 files passed; typecheck, lint, production build,
  format, and diff checks passed.
- Rust: 28 tests passed with 1 opt-in benchmark ignored; migration/alias tests,
  fmt, and Clippy (all targets, warnings denied) passed.

Production-bundled search benchmark: macOS 26.6.2, Node 24.19.0. The fixture has
10,000 active Products, 50,000 active Units, and 10,000 aliases. Fixture/entity
construction is excluded; `index_load` measures replacement and Fuse index
construction from ready Domain objects. One warm-up is excluded. P95 uses the
nearest-rank sample.

| Operation | Samples | Median ms | P95 ms | Max ms | Requirement |
| --- | ---: | ---: | ---: | ---: | --- |
| Index load | 20 | 57.414 | 60.928 | 61.372 | ≤500 ms P95, ≤1,000 ms max |
| Autocomplete | 100 | 48.822 | 50.654 | 53.664 | ≤100 ms P95, ≤300 ms max |

## #17 — Keyboard-first Create Invoice UI

[Issue #17](https://github.com/baonguyen1776/smart_invoice/issues/17) — implementation checks passed on 2026-09-10.

- Built `CreateInvoiceScreen` for the UC-01 cashier workflow, supporting keyboard-driven autocomplete search, multi-unit selection, item line addition, quantity editing, VIP unit-price overrides, and line removal with undo support.
- Top-level `App` provides sidebar navigation between Create Invoice and Product Management, defaulting to Create Invoice when invoice actions are present, and supports navigating with pre-filled search query from the not-found state.
- In-memory Fuse.js candidate selection distinguishes duplicate names using SKU, brand, category, and active unit tags. Selecting a single-unit product automatically populates price and adds the line; multi-unit products display a modal with 1..9 numeric shortcuts.
- Manual VIP price overrides change only the transaction-time `InvoiceItem.unitPrice` and `subtotal`, leaving the catalog `Unit.price` unchanged.
- Frontend: 132 tests across 15 files passed; typecheck, lint, production build, format, and diff checks passed.
- Rust: 28 unit/regression tests passed; fmt and Clippy (all targets, warnings denied) passed.

## #18 — Draft auto-save and crash recovery

[Issue #18](https://github.com/baonguyen1776/smart_invoice/issues/18) — implementation checks passed on 2026-09-11.

- **Crash Recovery & Cold-start Resume**: Introduced Application use case `RestoreInvoiceDraft` which checks the active session draft ID or restores the latest uncompleted draft (`status = 'draft'` sorted by `updated_at DESC, invoice_number DESC`) from SQLite. When reopening the application or recovering from an abnormal termination, all line items, quantities, custom VIP unit prices, discounts, and customer contact notes are restored with zero data loss.
- **Atomic Semantic Auto-save**: Every item addition, quantity update, VIP unit price override, discount update, removal, and undo commits within an atomic `BEGIN IMMEDIATE` database transaction. UI tracks pending promises, shows an actionable "Đang lưu..." indicator, and never reports success until the database transaction has committed.
- **Clean Failure Isolation**: Write failures roll back completely to the last valid snapshot and display actionable localized error messages ("Chưa lưu được thay đổi...", "Giá trị hoặc tổng tiền vượt giới hạn...") without exposing raw SQLite internals.
- **Zero-Warning Code Quality**: Resolved React 19 hook cascading render warnings by rehydrating customer metadata during draft initialization and triggering draft list updates on demand.
- **NFR-PERF-007 Benchmark**: Measured draft persistence for 10, 50, and 100 items using a file-backed SQLite database in release profile over 100 samples per tier:

| Operation | Items | Samples | Median ms | P95 ms | Max ms | Requirement (NFR-PERF-007) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Save Draft Items | 10 | 100 | 0.474 | 0.698 | 0.933 | ≤50 ms |
| Save Draft Items | 50 | 100 | 1.026 | 1.229 | 1.435 | ≤150 ms |
| Save Draft Items | 100 | 100 | 1.814 | 1.944 | 2.209 | ≤300 ms P95 |

## #28 — Allow negative-quantity return/deduction lines in invoices

[Issue #28](https://github.com/baonguyen1776/smart_invoice/issues/28) — implementation and verification checks passed on 2026-09-12.

- **Business Capability & Accounting Convention**:
  - Wholesale customer goods returns and credit deductions are supported by entering a negative integer quantity (e.g. `-10`).
  - Subtotal, discount amount, payment, and overall invoice total can be negative (credit balance).
  - Negative amounts in the invoice table and totals footer are formatted using Vietnamese accounting convention with parentheses, e.g. `(37.000 ₫)` or `(3.700 ₫)`.
  - Zero quantity remains strictly rejected (`quantity === 0` is invalid).
- **5-Layer Architecture Updates**:
  1. **SQLite Migration (`0005_allow_negative_quantity.sql`)**: Rebuilds `invoices` and `invoice_items` to widen `CHECK` constraints on `quantity` (`BETWEEN -9007199254740991 AND -1 OR BETWEEN 1 AND 9007199254740991`), `subtotal` (`BETWEEN -9007199254740991 AND 9007199254740991`), and `total` (`BETWEEN -9007199254740991 AND 9007199254740991`). Dropping sequence prevents cascade deletion of child items under foreign keys.
  2. **Rust Backend (`database.rs`)**: In `calculate_and_validate_total`, permits negative subtotals, validates non-zero safe integers, and applies symmetric half-away-from-zero rounding for discounts on negative lines (`(raw + 5000) / 10000` for positive, `(raw - 5000) / 10000` for negative).
  3. **Domain Layer (`InvoiceItem.ts`, `Invoice.ts`)**: `InvoiceItem` validates `quantity !== 0` within safe integer range. `Invoice.calculateTotal` allows signed totals within safe integer bounds.
  4. **Domain Rules (`CalculateInvoiceAmounts.ts`)**: `calculateInvoiceLineAmounts` and `sumInvoiceAmounts` symmetrically compute signed subtotals, discounts, and payments with exact `BigInt` arithmetic.
  5. **Presentation Layer (`useInvoiceGrid.ts`, `InvoiceLineItems.tsx`)**: Input regex `/^-?\d+$/` allows negative quantities; grid input accepts negative numbers; table cells and summary footer render parenthesized negative amounts.
- **Verification Evidence**:
  - TypeScript & ESLint: 0 errors, 0 warnings.
  - Vitest: 185/185 tests pass across 16 files (added negative quantity unit tests in `CalculateInvoiceAmounts.test.ts`, `InvoiceItem.test.ts`, `Invoice.test.ts`, and `CreateInvoiceScreen.test.tsx`).
  - Rust: 33/33 tests pass (added `negative_quantity_return_lines_persist_and_recalculate_totals_correctly` in `database_regression_tests.rs`).
  - Clippy & fmt: clean (`cargo clippy --all-targets -- -D warnings`).
  - Release Benchmark: `invoice_draft_benchmark` passes NFR-PERF-007 budget in 0.37s.

## Bugfix — Draft Restoration and Draft Modal Selection Resilience

Verification checks passed on 2026-09-12.

- **Root Causes**:
  1. `Invoice.rehydrate` strictly required `state.total === calculateTotal(state.items)` even for drafts (`status === "draft"`). When draft records in the database had mismatched or desynchronized totals (e.g. from migrations, test data, or partial updates), rehydration threw `InvoiceValidationError`, causing `listInvoices("draft")` and `restoreInvoiceDraft` to fail completely and block startup with "Không thể mở hóa đơn nháp. Vui lòng thử lại.".
  2. `RestoreInvoiceDraft` did not fall back when `preferredInvoiceId` failed to load or was not a draft, failing the entire restore operation.
  3. `SQLiteInvoiceRepository.listInvoices` failed the entire list if any single invoice record was corrupt, instead of skipping corrupt records to preserve availability.
  4. In `CreateInvoiceScreen.tsx`, `handleSelectDraft` was silently blocked by `#invoice-workspace [data-dirty="true"]`, leaving the user unable to switch drafts when a cell had unsaved changes. Furthermore, `<InvoiceLineItems>` lacked a `key={invoice?.id}`, causing the line items spreadsheet hook (`useInvoiceGrid`) to retain stale row order from the previous draft and render phantom rows.
- **Fixes Applied**:
  - **Domain (`Invoice.ts`)**: Only enforce strict total check on `status === "completed"`. For drafts, `total` self-heals by computing `calculateTotal(state.items)`.
  - **Application (`RestoreInvoiceDraft.ts`)**: Gracefully fall back to other available drafts or a newly created draft if `preferredInvoiceId` cannot be loaded.
  - **Infrastructure (`SQLiteInvoiceRepository.ts`)**: Safely rehydrate records in `listInvoices`, skipping corrupt records to preserve draft list availability.
  - **Presentation (`CreateInvoiceScreen.tsx`, `useInvoiceGrid.ts`)**:
    - Add `key={invoice?.id}` to `<InvoiceLineItems>` to guarantee clean remount and fresh grid state per invoice.
    - Remove silent blocking `data-dirty` check in `handleSelectDraft`; display friendly notice if a save is in progress.
    - Clean up removed items in `useInvoiceGrid` when items signature changes.
- **Verification Evidence**:
  - 189/189 Vitest unit tests pass across 16 files (added 4 new tests in `Invoice.test.ts`, `InvoiceUseCases.test.ts`, `SQLiteInvoiceRepository.test.ts`, and `CreateInvoiceScreen.test.tsx`).
  - 33/33 Rust tests pass.
  - `npm run typecheck` and `npm run lint`: clean (0 errors, 0 warnings).

## Issue #19 — Complete Invoices and Confirmed Overwrite of Completed Edits

Verification checks passed on 2026-09-12.

- **Objective**:
  Implement the draft invoice completion workflow (`draft -> completed`) and safe, confirmed overwrite editing for completed invoices as defined in UC-01 and Sprint 3 (UX-006 & UX-007).
- **Architectural & Design Implementation**:
  1. **Domain & Application**: Wired existing application use-cases `CompleteInvoice` and `OverwriteCompletedInvoice` into UI presentation layer through `InvoiceScreenActions`.
  2. **Draft Completion**:
     - Completed via button "Hoàn thành" in `CreateInvoiceScreen.tsx`, requiring at least 1 line item.
     - Persists completion via `CompleteInvoice`, setting immutable `completed_at` timestamp.
     - Clears `smart_invoice_active_draft_id` from `localStorage` upon completion to prevent stale recovery.
     - Updates header badge to `[ ĐÃ HOÀN TẤT ]` and displays confirmation feedback.
  3. **Completed Invoice Browsing**:
     - Upgraded Invoices modal with tabs `[ Bản nháp (n) ]` and `[ Đã hoàn thành (m) ]`.
     - Displays formatted invoice numbers, timestamps, item counts, customer info, and total amounts.
     - Supports viewing and reopening completed invoices into the main workspace.
  4. **Protected In-Memory Staged Edits**:
     - Modifying line items on a completed invoice applies in-memory changes via `applyItemChangeInMemory` and domain method `invoice.overwriteCompleted(nextItems, now)`.
     - Avoids silent auto-save to prevent corrupting completed records.
     - Displays high-visibility staged changes alert banner (`notice-staged-changes`).
     - Provides instant "Hủy thay đổi" action to revert in-memory edits to the original persisted state.
  5. **Atomic Overwrite with Confirmation**:
     - "Lưu ghi đè" opens a dedicated Overwrite Confirmation Dialog displaying invoice number and recalculated total.
     - Confirming executes `actions.overwriteCompletedInvoice.execute({ invoiceId, confirmed: true, items })`.
     - Preserves immutable identities (`id`, `invoice_number`, `created_at`, `completed_at`, `status = "completed"`).
  6. **Fresh Draft Creation**:
     - "Tạo hóa đơn mới" allows cashiers to immediately spin up a new draft without modifying the completed invoice.
- **Verification Evidence**:
  - TypeScript & ESLint: 0 errors, 0 warnings (`npm run typecheck && npm run lint`).
  - Vitest: 196/196 tests pass across 16 test files (added 7 new tests in `CreateInvoiceScreen.test.tsx` verifying completion, error states, modal tab switching, in-memory staging, revert, overwrite confirmation, and new draft creation).
  - Rust: 35/35 unit tests pass (`cargo test --manifest-path src-tauri/Cargo.toml`).
  - Production build: `npm run build` succeeds cleanly.

## Run checks

From the repository root; native smoke requires a graphical desktop, creates an isolated profile and times out after 30 seconds per process.

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run format:check
npm run benchmark:search
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --release --lib catalog_benchmark -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml --release --lib invoice_draft_benchmark -- --ignored --nocapture
cargo build --manifest-path src-tauri/Cargo.toml --release --example native_smoke --features tauri/custom-protocol
node scripts/native-smoke.mjs
git diff --check
```
