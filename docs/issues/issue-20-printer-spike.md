# Spike #20 — Printer Hardware and Output Format Validation

**Date:** 2026-09-22
**Author:** Nguyen Phuong Gia Bao
**Issue:** [#20 spike: validate printer hardware and output format](https://github.com/baonguyen1776/smart_invoice/issues/20)
**Follow-up:** [#21 feat: implement PrinterService and print completed invoices](https://github.com/baonguyen1776/smart_invoice/issues/21)

---

## Decision

> **Use `window.print()` with CSS `@media print` targeting A5 landscape paper.**
>
> `tauri-plugin-printer-v2` is deferred — not used in v1.

---

## Context

### Deployment Target

| Item | Detail |
|---|---|
| **OS** | Windows (production handoff) |
| **Printer** | Canon (exact model TBD — assumed standard laser/inkjet: LBP / MF / iP series) |
| **Paper size** | A5 landscape (210 mm × 148 mm) |
| **Runtime** | Tauri v2 — Chromium-based WebView |
| **Dev environment** | macOS |

### Existing Print Flow (already implemented)

```
User clicks "Print" in InvoiceReceiptPreviewModal
  │
  ▼
handlePrint() → window.print()
  │
  ▼
WebView triggers Windows Print Spooler
  │
  ▼
Windows Print Dialog (user confirms, selects printer if needed)
  │
  ▼
Canon driver receives job → prints on A5 paper
```

CSS already in place at [`InvoiceReceiptPreviewModal.css`](../src/presentation/components/InvoiceReceiptPreviewModal.css):

```css
@media print {
  @page {
    size: A5 landscape;
    margin: 0;
  }
}
```

---

## Analysis

### Chosen approach: `window.print()` + CSS `@media print`

**Advantages:**
- **Already implemented** — no additional complexity.
- **High fidelity:** Chromium renders both the preview and the printed output using the same engine → true WYSIWYG.
- **Canon compatibility:** Canon laser/inkjet printers use standard Windows GDI/XPS — Windows Spooler delivers print jobs without any driver-specific workaround.
- **Vietnamese Unicode:** Full diacritic support rendered by Chromium; no font substitution risk.
- **No additional plugin** — eliminates a dependency and its associated risk surface.
- **Cross-model:** Works with any Canon model that has a standard Windows driver.

**Drawbacks:**
- The Windows Print Dialog appears after the in-app preview, creating a minor UX seam.
- No programmatic printer selection within the app itself.

**Assessment for v1:** Acceptable. The Windows Print Dialog is familiar to end-users; technical risk is zero.

### Rejected alternative: `tauri-plugin-printer-v2` (silent print)

| Reason for rejection | Detail |
|---|---|
| Plugin stability | Community-maintained; API may break without notice |
| Render fidelity risk | Plugin renders HTML internally — output may differ from the Chromium WebView preview |
| Cannot test on macOS | Dev environment does not match the Windows deployment target |
| Implementation complexity | Requires in-app printer selection UI, error-recovery flows, and additional Rust plumbing |
| Sprint scope | v1 prioritises on-time delivery |

---

## Technical Confirmation

### A5 Landscape CSS — Confirmed present

[`InvoiceReceiptPreviewModal.css`](../src/presentation/components/InvoiceReceiptPreviewModal.css):

```css
@media print {
  @page { size: A5 landscape; margin: 0; }
}
```

### Pagination — Confirmed implemented

[`PaginateInvoiceReceipt.ts`](../src/presentation/printing/PaginateInvoiceReceipt.ts):
- `DEFAULT_RECEIPT_MEASUREMENTS` is calibrated for A5 landscape.
- `useReceiptPagination` hook measures live DOM heights to prevent overflow.

### Print handler — Confirmed implemented

[`InvoiceReceiptPreviewModal.tsx`](../src/presentation/components/InvoiceReceiptPreviewModal.tsx) line ~80:

```ts
const handlePrint = useCallback(() => {
  if (onPrint) onPrint();
  else window.print();
  if (onConfirmPrinted) setAwaitingPrintConfirmation(true);
}, [...]);
```

---

## Adjusted Scope for Issue #21

Issue #21 originally referenced `tauri-plugin-printer-v2`. **Scope is updated based on this spike:**

| Item | v1 Scope |
|---|---|
| `PrinterService` interface | ✅ Required — wraps `window.print()`; keeps browser globals out of the Domain layer |
| `tauri-plugin-printer-v2` adapter | ❌ Not in v1 |
| Block printing draft invoices | ✅ Required — print action available only for completed invoices |
| Printer error handling | ✅ Required — map failures to actionable user-visible messages |
| In-app printer selection UI | ❌ Deferred to v2 (Windows Print Dialog serves this need for now) |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Specific Canon model rejects A5 landscape | Low | Canon LBP/MF/iP all support A5; if hit, guide user to set paper size in Windows printer settings |
| Windows Print Dialog confuses non-technical users | Medium | Add a brief tooltip: "Select Canon printer, then click Print" |
| Content overflows a single page | Low | Handled by `useReceiptPagination` |

---

## Conclusion

- ✅ Use `window.print()` + CSS A5 landscape for v1
- ✅ Canon standard printer on Windows: fully compatible via Windows Spooler
- ✅ No additional plugin or Rust adapter required
- ✅ Issue #21 proceeds with adjusted scope

**Verification at time of spike:**

```
npm run typecheck    ✅  0 errors
npm run lint         ✅  0 errors, 0 warnings
npm run format:check ✅
npm run test         ✅  334/334 passed
npm run build        ✅
cargo test           ✅  40/40 passed
```
