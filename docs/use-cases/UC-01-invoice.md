# Use Cases — Quick Invoice System

## Overview Diagram

```mermaid
graph LR
    Owner((Owner))
    Owner --> UC1[UC-01: Create Invoice]
    Owner --> UC2[UC-02: Manage Products]
    UC1 -. "product not found" .-> UC2
```

---

## UC-01: Create Invoice

**Actor:** Owner
**Precondition:** The system has at least one active product in the database

### Main flow
1. Open the "Create Invoice" screen (new invoice, status = `draft`, with a
   positive user-facing invoice number assigned atomically)
2. Type the product name into the input field
3. The system performs a fuzzy search and displays a dropdown of matching products
4. Select a product (↑↓ + Enter, or click)
5. The system checks the number of units:
    - 1 unit → auto-fill the unit and price
    - >1 unit → select a unit → fill in the corresponding price
6. Enter a positive integer quantity → the system calculates the line total =
   price × quantity
7. Add the line item to the invoice table
8. The system automatically saves the draft to the database after each semantic change
9. Repeat steps 2–8 for other products
10. The system calculates the total amount
11. Click "Complete" → status changes from `draft` to `completed`
12. Click "Print" → send the invoice to the printer

### Alternate flow
- **A1 (VIP price):** Manually edit the price in steps 5/6 if the customer is a VIP
- **A2 (Edit a completed invoice):** Reopen a `completed` invoice → edit it → the system displays a confirmation dialog → if confirmed, the new data overwrites the old data
- **A3 (Return/Deduction line):** Enter a negative integer quantity (e.g. `-10`) to record goods returned or credit deduction from a previous invoice. The system computes negative subtotal and payment amounts, displayed using Vietnamese accounting convention `(37.000 ₫)` (parenthesized negative amounts). Net invoice total may be negative (credit balance).

### Exception flow
- **E1:** No matching product is found → display a notification and suggest using UC-02 to add a new product
- **E2:** A line item is deleted by mistake → provide a delete-line button with undo support
- **E3:** The app closes unexpectedly → the draft data has already been saved automatically and will be restored when the app is reopened

### Approved invoice rules

#### Identity and values

- `Invoice.id` and every `InvoiceItem.id` are UUID v4 strings.
- `invoice_number` is a positive unique integer assigned when the draft is
  created. Number gaps are allowed.
- Money is stored as integer VND values; floating-point money is forbidden.
  Negative money is allowed for return lines and net-credit invoice totals.
- Quantity is a non-zero safe integer (positive for sales, negative for customer
  returns/deductions; zero remains rejected). Fractional quantities and unit
  conversions are outside the MVP.
- A VIP price override changes the transaction-time `InvoiceItem.unit_price`;
  it never changes the selected Unit's catalog price.

#### Historical snapshots

When an item is added, it copies these catalog values into immutable
transaction-time fields:

```text
product_name
product_sku (nullable)
product_brand (nullable)
unit_name
unit_price
```

Invoice history and printing use these snapshots. They do not look up mutable
Product or Unit names/prices, so later catalog edits and deactivation cannot
change an old invoice.

#### Draft and completed state

- A draft may be empty and is persisted immediately so crash recovery works.
- A draft may change items, quantities, transaction prices, and total.
- Completing requires at least one valid item and changes `draft` to
  `completed`.
- A completed invoice never transitions back to `draft`.
- Reopening a completed invoice for editing requires explicit confirmation.
- A confirmed save atomically overwrites its items and total, preserves `id`,
  `invoice_number`, `created_at`, and the original `completed_at`, keeps status
  `completed`, and updates `updated_at`.
- There is no version or audit-history record.

#### Transaction boundaries

The following writes are atomic and roll back completely on failure:

1. Draft creation together with invoice-number assignment.
2. Each semantic draft edit together with item and total persistence.
3. Completion validation and the status/total/completion-time write.
4. Confirmed overwrite of a completed invoice and all replacement items.

Errors retain operation context for diagnostics and are mapped before reaching
the user; database rows or raw SQL errors do not leak into Presentation.

### Flow diagram

```mermaid
flowchart TD
    A[Open the Create Invoice screen] --> B[Type the product name]
    B --> C{Fuzzy search<br/>returns results?}
    C -- No --> C1[Display not-found notification]
    C1 --> C2[Go to UC-02:<br/>Manage Products]
    C -- Yes --> D[Display suggestion dropdown]
    D --> E[Select a product]
    E --> F{Does the product have<br/>more than 1 unit?}
    F -- Yes --> F1[Select a unit]
    F1 --> G[Auto-fill the price for the unit]
    F -- No --> G
    G --> G1{Is the customer a VIP?}
    G1 -- Yes --> G2[Edit the discounted price]
    G1 -- No --> H
    G2 --> H[Enter the quantity]
    H --> I[Calculate line total = price x quantity]
    I --> J[Add the line item to the invoice]
    J --> K[Debounced auto-save of the draft]
    K --> L{Add another product?}
    L -- Yes --> B
    L -- No --> M[Calculate the total amount]
    M --> N[Click Complete]
    N --> O[Status: draft -> completed]
    O --> P[Print the invoice]
```

---


## Spreadsheet detail entry (approved September 11, 2026)

The detail grid contains Stt, Tên hàng hóa, Đvt, Số lượng, Đơn giá, Thành tiền,
CK (%), Tiền CK, and Thanh toán. Begin with one editable blank row; append one
new trailing row when that row is first entered, without a fixed row limit.
Unfinished rows remain UI input state until a valid catalog selection and valid
amounts can be saved. They must block completion and must never be persisted as
invalid InvoiceItems. Product autocomplete and unit selection occur inside cells.
Enter/Tab traverse editable cells; derived money columns are read-only. The
sticky totals row includes all filled lines, irrespective of table filtering.

Line CK uses the precision, rounding, persistence, and net-total contract in
`docs/architecture.md` §19.6. Deleting and undoing a line retains its CK. The
right summary keeps its layout and displays the saved invoice total after CK.


## Customer persistence and print confirmation (approved September 14, 2026)

- Draft customer fields save on field blur independently of item edits, through
  an Application use case and the same per-editor save queue as item changes.
  Application also serializes the complete draft read/edit/write operation per
  invoice and repository instance, including across editor remounts. This is
  process-local ordering, not cross-process concurrency control.
- SQLite is authoritative for saved customer data. Browser storage retains only
  explicitly pending recovery input; successful persistence removes that cache.
  Legacy unmarked caches migrate only when the draft has no persisted customer
  fields. A failed save retains input and provides retry.
- Customer-only edits to a completed invoice are staged, use the existing
  confirmed overwrite, and are restored by Discard Changes along with items.
- Pending or invalid grid input blocks both completion and confirmed overwrite.
- With the current browser print dialog, opening or dismissing the dialog does
  not establish that printing succeeded. After the dialog returns, show
  “Đã in thành công” and “Đã hủy / Chưa in”. Persist `is_printed`/`printed_at`
  only after the user explicitly confirms success. Cancellation and print-dialog
  errors leave the prior status unchanged. A failed status write can be retried
  without printing another copy. This temporary confirmation flow does not
  replace the planned hardware spike and PrinterService adapter.
