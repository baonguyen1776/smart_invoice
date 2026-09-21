# Product spreadsheet import — issue review

Review date: 2026-09-21. Scope: issues #52, #53, and #54.

## Issue coverage

| Issue | Implemented | Remaining differences |
| --- | --- | --- |
| #52 — KiotViet XLSX parsing | Application parser port; browser ZIP/XML parsing; first worksheet and shared strings; required/optional column mapping; empty-row filtering; invalid-workbook and missing-column errors. No new runtime dependency. | None identified against the issue acceptance criteria. |
| #53 — Safe preview and apply | Groups product units; retains alternate SKU aliases; exact SKU/alias lookup; explained component matching; explicit duplicate/update decisions; editable integer-VND prices; safe merge retaining existing metadata and prices; atomic product/unit/alias writes; search-index refresh. | Success reports created/updated/skipped products plus added units/aliases, not separate invalid/failed row counts. Invalid candidates appear in preview; failed batches return an error. Persistence uses a batch repository sharing existing Rust transaction helpers, instead of calling separate create/update/alias use cases. |
| #54 — Import review UI | Product-management trigger; file selection; preview/filter/search/pagination; row reasons and matching evidence; decision gating; bulk suggested prices; inline price correction; success refresh and error messages. | The summary groups exact/possible matches as “cần review” rather than separate update/duplicate counters. The dialog is compact and responsive instead of always full-screen, as subsequently requested by the user. |

Only #52 is designated for automatic closure by this PR. Keep #53 and #54 open until their outstanding reporting criteria are completed or explicitly revised.

## User-approved behavior

- Category normalization removes a generic VPP prefix, but retains meaningful hierarchy: `VPP>>Viết` → `Viết`; `Sách>>Anh Văn>>Cấp 1` → `Sách Anh Văn Cấp 1`.
- Matching explains component scores (including brand abbreviations and model numbers); a suggested match never automatically authorizes a merge.
- A safe merge retains existing product metadata and unit prices and adds missing units and aliases.
- Double-clicking a price starts inline editing using the shared realtime VND input. Price warnings use a compact icon.
- Inline input width reserves caret space. A WebKit reproduction using the previous CSS measured a 64px input with 66px scrollable content and `scrollLeft=1`; the corrected layout measured 67px with `scrollLeft=0` for `7.100`. Deleting to `710` and entering `710.000.000` also retained `scrollLeft=0` in the isolated CSS check.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — 354 tests passed.
- `npm run build` — passed.
- `cargo fmt --check` — passed.
- `cargo clippy` — passed.
- `cargo test` — 40 passed; 2 benchmark tests intentionally ignored.
- Frontend checks and WebKit layout checks were performed before this commit split; Rust checks were performed during issue reconciliation. No application behavior changed during the split.
