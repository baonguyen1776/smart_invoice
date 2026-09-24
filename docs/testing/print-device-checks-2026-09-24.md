# Printer checks and error popup — September 24, 2026

## Behavior

Invoice editor and history now use the same printing use case and OS preflight.
An error opens a modal popup with an explanation, Close, and Retry. Missing
printers, offline/paused queues, other reported faults, and an unreadable print
service have separate messages. Closing the popup preserves invoice status.

The adapter checks configured queues using macOS CUPS or Windows Win32_Printer.
An eight-second process limit prevents a stalled inspection from blocking the
editor indefinitely. At least one queue without a reported fault permits the OS
dialog; one offline queue does not prevent choosing another usable queue.

Returning from the print dialog no longer marks an invoice printed. Explicit
user confirmation persists the status; cancellation leaves it unchanged. A
failed status write can be retried from the popup without opening the print
dialog or creating another copy. Receipt controls and closing are disabled
while a request is pending, preventing duplicate requests and printing after
the receipt has been dismissed. The error popup manages focus and traps Tab;
Escape closes only the error popup.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — 378 passed, 35 test files.
- `npm run build` — passed.
- `cargo fmt --check` — passed after formatting.
- `cargo clippy` — passed without warnings after renaming the internal error variant.
- `cargo test` — 47 passed; three intentionally ignored tests (two existing
  benchmarks and the opt-in native printer smoke test).
- `cargo test printer::tests::native_inspection_smoke -- --ignored --nocapture`
  — passed with host print-service access on macOS; output: `NoPrinters`.
- `LC_ALL=C /usr/bin/lpstat -p -l` — host returned
  `lpstat: No destinations added.` (exit 1, expected for this case).
  The sandboxed attempt returned `Bad file descriptor`; the implementation
  intentionally distinguishes this inspection failure from missing printers.
- `git diff --check` — passed.
- Visual review in Brave: production popup component displayed over a sample
  receipt; centered layout, readable error, Close and Retry buttons verified.
  Used temporary fixture files only, subsequently removed. Trigger, retry,
  cancellation, focus, and error mapping are covered by automated UI tests.

Rust parser tests cover CUPS and Windows status fixtures, mixed device states,
unknown output, description/name isolation, and a hung subprocess. Adapter
tests ensure failed inspection never opens the OS dialog. Screen tests exercise
both entry points and retrying persistence without duplicate printing.

## Limits

- Windows command execution and printing with a physical Canon remain untested
  in this macOS environment. Windows parsing is tested with documented status
  fixtures; it is not evidence of a successful Windows hardware run.
- The OS supplies queue/driver status, which can be stale or incomplete. This
  does not prove physical connectivity or paper output. The OS dialog controls
  the actual destination, including standard/PDF printer queues.
- A browser-only development session cannot inspect the OS through Tauri and
  reports that inspection failed. Run the desktop app for device inspection.
- Previously mislabelled invoices are not automatically reset. No existing
  invoice data was modified during this work.
- No new dependency, migration, or printer configuration change.

## Files changed

Created:

- `src-tauri/src/printer.rs`
- `src/infrastructure/printer/WebPrintAdapter.test.ts`
- `src/presentation/components/PrintErrorDialog.tsx`
- `docs/testing/print-device-checks-2026-09-24.md`

Modified:

- `src-tauri/src/lib.rs`
- `src/application/ports/PrinterService.ts`
- `src/application/use-cases/PrintInvoiceReceipt.ts`
- `src/application/use-cases/PrintInvoiceReceipt.test.ts`
- `src/infrastructure/printer/WebPrintAdapter.ts`
- `src/main.tsx`
- `src/presentation/components/InvoiceReceiptPreviewModal.tsx`
- `src/presentation/components/InvoiceReceiptPreviewModal.css`
- `src/presentation/components/InvoiceReceiptPreviewModal.test.tsx`
- `src/presentation/screens/CreateInvoiceScreen.tsx`
- `src/presentation/screens/CreateInvoiceScreen.test.tsx`
- `src/presentation/screens/InvoiceHistoryScreen.tsx`
- `src/presentation/screens/InvoiceHistoryScreen.test.tsx`
- `docs/architecture.md`
- `docs/use-cases/UC-01-invoice.md`

Temporary QA files `print-review.tmp.html` and `src/test/print-review.tmp.tsx`
were created and removed. No tracked file was deleted.

## Native API references

- [CUPS lpstat](https://www.cups.org/doc/man-lpstat.html)
- [Microsoft Win32_Printer](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-printer)
- [Window.print return value](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)

The architecture note now reflects the existing spike #20 decision to defer
the printer plugin and use the OS print dialog, superseding the older plugin
wording. The new read-only OS inspection follows the user's September 24 request.
