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

Both measured paths meet NFR-PERF-003 and NFR-PERF-004 on this environment.
Cross-platform/minimum-spec measurements remain unverified.

## Run checks

From the repository root; native smoke requires a graphical desktop, creates an isolated profile and times out after 30 seconds per process.

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run format:check
npm run benchmark:search
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --release --lib catalog_benchmark -- --ignored --nocapture
cargo build --manifest-path src-tauri/Cargo.toml --release --example native_smoke --features tauri/custom-protocol
node scripts/native-smoke.mjs
git diff --check
```
