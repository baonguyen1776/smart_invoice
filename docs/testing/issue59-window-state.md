# Issue #59 and window restoration — September 26, 2026

## Result

Issue #59: the desktop screens now share `styles/tokens.css` for colors,
spacing, radii, typography, focus treatments, and status colors. Orange
selection/focus fallbacks use the shared blue primary palette. Invoice history
uses the same application frame/sidebar as the invoice and product screens.
The product search field stays usable at the minimum window width. Receipt
preview controls use the tokens; physical receipt styles remain separate.

Requested window behavior: the last normal logical width/height, maximized
state, and native fullscreen state are stored in `window-state.txt` under
Tauri's application configuration directory. Normal dimensions survive
fullscreen, maximize, and minimize. The app captures preferences on focus loss,
window close, and application exit. Missing or invalid preferences use the
configured defaults. The size is applied while the window is hidden, then the
saved display mode is applied through native APIs. No dependency or database
migration was added.

Preferences take effect after this source is rebuilt and launched. This change
does not update an already-installed app automatically. Window position and
browser/content zoom are not part of the requested size/fullscreen preference.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed, zero warnings.
- `npm run test` — passed: 370 tests across 37 files.
- `npm run build` — passed.
- `cargo build --manifest-path src-tauri/Cargo.toml` — passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
  — passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` — passed: 44 tests; two
  existing performance benchmarks intentionally ignored.
- `cargo build --manifest-path src-tauri/Cargo.toml --example window_state_smoke`
  — passed.
- `node scripts/window-state-smoke.mjs` — passed on macOS: 13 fresh processes
  covering 1400×700 (10:5) restoration, maximize/reopen/unmaximize,
  fullscreen/reopen/exit-fullscreen, minimize/reopen, close/reopen,
  application-exit persistence, and malformed-preference recovery to 1280×800.
  The script uses a separate `com.smartinvoice.smoke.window…` profile and no
  business data. A graphical desktop with room for 1400×700 is required.
- Prettier check on changed frontend files and the smoke runner — passed.
- `git diff --check` — passed.

Browser visual inspection used an isolated headless Brave profile with mocked
IPC products and completed invoices. All three screens were checked at
1440×900 and 1024×680, including history's calendar filter. Sidebar widths match
(208px and 176px respectively), there is no document-level horizontal overflow,
and there were no page errors. Invoice/product tables keep their existing
internal horizontal scrolling at narrow widths. Windows/Linux native window
behavior and cross-monitor DPI changes were not exercised on this macOS host.

## Changed files

- `src/presentation/styles/tokens.css` (new)
- `src/presentation/App.css`
- `src/presentation/components/InvoiceLineItems.css`
- `src/presentation/components/InvoiceReceiptPreviewModal.css`
- `src/presentation/components/ProductImportDialog.css`
- `src/presentation/components/QuickCalculator.css`
- `src/presentation/components/WorkspaceSidebar.css`
- `src/presentation/screens/CreateInvoiceScreen.css`
- `src/presentation/screens/InvoiceHistoryScreen.css`
- `src/presentation/screens/InvoiceHistoryScreen.tsx`
- `src-tauri/src/window_state.rs` (new; implementation and four regression tests)
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/examples/window_state_smoke.rs` (new)
- `scripts/window-state-smoke.mjs` (new)
- `docs/testing/issue59-window-state.md` (new)
