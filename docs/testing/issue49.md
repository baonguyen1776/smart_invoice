# Issue #49 verification

Implemented locally on `feature/invoice-logic-corrections`, September 14, 2026.
Updated for user review on September 15, 2026; the current behavior is below.

## Behavior

- New grid rows scroll into view within the table without stealing keyboard
  focus. Edits, deletion, filtering, and sorting do not trigger scrolling.
- Optional nonnegative old debt appears immediately above Complete. Numeric
  editing switches to Vietnamese thousands separators on blur. Draft saving,
  retry, completion, completed overwrite, discard, and rehydration retain debt.
  Zero debt is displayed as an empty field. Empty detail tables no longer stretch
  their card; the desktop footer stays visible. The staged-change banner is removed.
- Migration `0008` adds debt with a zero default and integer/range constraints.
  Combined totals are validated in Domain and SQLite. Existing invoice item
  totals retain their meaning; final total adds debt after line discounts.
- Preview and print use identical A5 landscape geometry. The automatic layout
  chooses the smaller page count, preferring the shop when counts match. The
  **In / Không in** selector reflects that result and then obeys manual selection
  unconditionally. Short, single-sheet receipts now add blank rows only within
  remaining space (see clarification below). No font compression. Continuation sheets
  start with item rows, with no repeated shop, title, customer, or column header.
  Totals and optional debt rows occur once, with the final item.
- A body-level React portal removes the application layout from printing. The
  print stylesheet preserves the paper padding and prevents blank extra pages.

## Automated verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm run test -- --reporter=dot` | Passed: 301 tests, 24 files |
| `npm run build` | Passed |
| `cargo fmt --check` (in `src-tauri`) | Passed |
| `cargo clippy` (in `src-tauri`) | Passed |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Passed: 39 tests; 2 existing opt-in benchmarks ignored |
| `git diff --check` | Passed |

Tests cover the migration from schema version 7, draft/debt persistence,
validation and rollback, customer/debt serialization, completed overwrite and
safe-range boundaries, failed saves/retry, scrolling and focus, pagination,
conditional totals, return amounts, and unchanged print-result confirmation.

## Browser and PDF verification

Isolated headless Brave/Chromium against the local Vite server; native PDFKit
inspected generated PDFs. CSS page size resolves to approximately 210×148 mm.

| Fixture | Preview and PDF pages | Result |
| --- | --- | --- |
| 9 items + 50,000 VND debt | 1 | Shop header retained; 9 rows; totals then debt |
| 14 items + 50,000 VND debt | 1 | Shop header removed; all 14 rows retained |
| 14 items + debt; user selects In | 2 | Shop retained, 13 / 1 items |
| 16 items + debt; automatic | 2 | Shop retained because both choices require two sheets; 14 / 2 items |
| 16 items + debt; user selects Không in | 2 | Shop omitted on request; 15 / 1 items |
| 45 items + debt; automatic | 3 | Shop retained; 14 / 21 / 10 items |

Every PDF page contains text; no blank pages were generated. Extracted text
confirms the shop header, title, totals, and debt appear only where required.
The continuation-page PDF was rendered and visually inspected: it begins with
item rows and contains no repeated column headings.

Editor checks at 1400×1000 and 1366×768 confirmed:

- Empty card ends 1 px below the totals row (its border), at both desktop sizes.
- Zero-debt input is blank; its stored value remains zero.
- New trailing row bottom aligns with the visible area above the sticky totals.
- Keyboard focus remains on the row being edited.
- After scrolling to 80 px, editing and deleting leave `scrollTop` at 80 px.
- Old debt and Complete remain inside the viewport; at 1366×768, Complete ends
  at y=728 and the debt input ends at y=676, above the button.

Frontend checks were rerun for the September 15 review. Rust was unchanged by
that review; the recorded Rust results are from the September 14 implementation.

The browser fixture uses an in-memory repository; actual SQLite behavior is
covered by Rust integration tests. Physical printing and the OS duplex setting
were not tested. Select **one-sided** in the printer dialog to leave sheet backs
blank. The browser API cannot enforce that device setting.

Local PDFs, screenshots, and the temporary browser fixture/scripts are saved
beside the repository in `../issue49-verification/`. They are not build inputs. Current screenshots, PDFs, and browser assertions
are under `../issue49-verification/revision-2026-09-15/`.

## Blank-row clarification — September 15

Restored the original fonts, row heights, and top alignment. For a single-sheet
invoice with fewer than 14 items, add empty nine-cell rows below the real items,
then totals. The target is 14 body rows, limited by measured space including old
debt. Real-item pagination determines shop visibility and page count before
padding, so blanks never require extra paper or change invoice amounts. Empty
drafts and multi-sheet invoices receive no decorative rows. This supersedes the
original no-padding behavior recorded above.

Browser/PDF checks passed: one item + 13 blanks; five items + 9 blanks;
three items with debt + 9 blanks; five items with debt + 7 blanks; five items
with notes and debt + 5 blanks; nine items with debt + 3 blanks. Long notes that
need two sheets, 14 items with debt, and 16 items with debt retain their original
pagination. Manual shop omission works. All 10 PDFs have the expected page count
and nonempty text. The one-item printed PDF was visually inspected.

Verification commands (all passed):

- `npm run typecheck`
- `npm run lint`
- `npm run test -- --reporter=dot` — 305 tests, 24 files
- `npm run build`
- `git diff --check`
- `node '../issue49-verification/blank-rows/browser-check.mjs'`
- `swift -module-cache-path /tmp/issue49-swift-cache '../issue49-verification/blank-rows/inspect-pdf.swift'`

Current fixture, assertions, PDFs, screenshots, and logs are in
`../issue49-verification/blank-rows/`. No persisted invoices were changed during
browser tests. Rust is unchanged in this follow-up.

Files changed in this follow-up:

- `src/presentation/components/InvoiceReceiptPreviewModal.tsx`
- `src/presentation/components/InvoiceReceiptPreviewModal.test.tsx`
- `src/presentation/printing/PaginateInvoiceReceipt.ts`
- `src/presentation/printing/PaginateInvoiceReceipt.test.ts`
- `src/presentation/printing/useReceiptPagination.ts`
- `docs/use-cases/UC-01-invoice.md`
- `docs/testing/issue49.md`

## Files changed

- [docs/agile-plan.md](../../docs/agile-plan.md)
- [docs/architecture.md](../../docs/architecture.md)
- [docs/testing/issue49.md](../../docs/testing/issue49.md)
- [docs/testing/issues.md](../../docs/testing/issues.md)
- [docs/use-cases/UC-01-invoice.md](../../docs/use-cases/UC-01-invoice.md)
- [src-tauri/migrations/0008_invoice_old_debt.sql](../../src-tauri/migrations/0008_invoice_old_debt.sql)
- [src-tauri/src/database.rs](../../src-tauri/src/database.rs)
- [src-tauri/src/database_benchmark.rs](../../src-tauri/src/database_benchmark.rs)
- [src-tauri/src/database_regression_tests.rs](../../src-tauri/src/database_regression_tests.rs)
- [src/application/use-cases/CompleteInvoice.ts](../../src/application/use-cases/CompleteInvoice.ts)
- [src/application/use-cases/OverwriteCompletedInvoice.ts](../../src/application/use-cases/OverwriteCompletedInvoice.ts)
- [src/application/use-cases/UpdateInvoiceOldDebt.test.ts](../../src/application/use-cases/UpdateInvoiceOldDebt.test.ts)
- [src/application/use-cases/UpdateInvoiceOldDebt.ts](../../src/application/use-cases/UpdateInvoiceOldDebt.ts)
- [src/domain/entities/Invoice.test.ts](../../src/domain/entities/Invoice.test.ts)
- [src/domain/entities/Invoice.ts](../../src/domain/entities/Invoice.ts)
- [src/infrastructure/repositories/SQLiteInvoiceRepository.test.ts](../../src/infrastructure/repositories/SQLiteInvoiceRepository.test.ts)
- [src/infrastructure/repositories/SQLiteInvoiceRepository.ts](../../src/infrastructure/repositories/SQLiteInvoiceRepository.ts)
- [src/main.tsx](../../src/main.tsx)
- [src/presentation/components/InvoiceLineItems.css](../../src/presentation/components/InvoiceLineItems.css)
- [src/presentation/components/InvoiceLineItems.test.tsx](../../src/presentation/components/InvoiceLineItems.test.tsx)
- [src/presentation/components/InvoiceLineItems.tsx](../../src/presentation/components/InvoiceLineItems.tsx)
- [src/presentation/components/InvoiceReceiptPreviewModal.css](../../src/presentation/components/InvoiceReceiptPreviewModal.css)
- [src/presentation/components/InvoiceReceiptPreviewModal.test.tsx](../../src/presentation/components/InvoiceReceiptPreviewModal.test.tsx)
- [src/presentation/components/InvoiceReceiptPreviewModal.tsx](../../src/presentation/components/InvoiceReceiptPreviewModal.tsx)
- [src/presentation/printing/PaginateInvoiceReceipt.test.ts](../../src/presentation/printing/PaginateInvoiceReceipt.test.ts)
- [src/presentation/printing/PaginateInvoiceReceipt.ts](../../src/presentation/printing/PaginateInvoiceReceipt.ts)
- [src/presentation/printing/useReceiptPagination.ts](../../src/presentation/printing/useReceiptPagination.ts)
- [src/presentation/screens/CreateInvoiceScreen.css](../../src/presentation/screens/CreateInvoiceScreen.css)
- [src/presentation/screens/CreateInvoiceScreen.test.tsx](../../src/presentation/screens/CreateInvoiceScreen.test.tsx)
- [src/presentation/screens/CreateInvoiceScreen.tsx](../../src/presentation/screens/CreateInvoiceScreen.tsx)
- [src/test/InvoiceLogicRegressions.test.tsx](../../src/test/InvoiceLogicRegressions.test.tsx)
