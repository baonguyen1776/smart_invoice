# Project Proposal: Quick Invoice System

## Problem

Small shop owners spend too much time manually creating sales invoices: typing each line item by hand, looking up prices, and calculating totals based on unit types. Adding newly identified products from purchase documents to the catalog is also time-consuming, requiring manual data entry for every new item.

## Users

Shop owners / small businesses. The app runs on **desktop only** (Windows / macOS / Linux) with printer connectivity for printing invoices. **Mobile is explicitly out of scope**, since printer connectivity is not practical on mobile devices.

## Solution — MVP (Phase 1): Invoice Creation + Product Management

### Product autocomplete (terminal-style fuzzy search)

- User types into the "Product name" field (e.g. "Sữa").
- The system performs a **fuzzy search** against the product database by matches don't need to be a continuous substring (similar to how typing "git" in a terminal suggests `git-shell`, `fcgistarter`, `segedit`, etc. based on scattered matching characters).
- Results appear in a dropdown list. Each row shows the **product name** (matched characters highlighted/bolded) plus a secondary column with **category or reference price** on the right, to help the user disambiguate quickly between similar items.
- Navigation: **Up/Down arrow keys** to move through the list, **Enter** to confirm. The most relevant match is **highlighted by default** so the user can just press Enter immediately.

### Unit selection and price auto-fill

- Each Product can have one or more Units (e.g. can / case), and **each Unit has its own price** (data model: `Product -> has many -> Unit`, each `Unit` has `unit_name` and `price`).
- If the selected product has **only one unit**, it is auto-filled.
- If it has **more than one unit**, the user is prompted to choose.
- The price is filled in based on the selected unit's price.

### VIP pricing

- The filled-in price can be manually overridden/adjusted for VIP customers who receive special pricing.

### Product management

- Full CRUD for products, units, and prices.

### Printing

- Print the finished invoice to a printer connected to the desktop.

## Phase 2 (post-MVP): AI-assisted extraction from structured purchase invoices

- Input: a PDF file or a scanned image of a **structured** purchase invoice (clear layout/columns — not free-form handwriting).
- Output: extracted line items become a purchase draft and suggestions for new products, **pending human review, confirmation, and manual entry of the selling price** by the user.
- The feature does not track inventory quantities or create products without confirmation.
- Complexity: medium — relies on OCR plus table/layout detection.

## Phase 3 (post-MVP): AI-assisted extraction from handwritten purchase invoices

- Input: a photo of a **handwritten** purchase invoice.
- Requires a review/correction step before saving, since handwriting OCR accuracy (especially for Vietnamese with diacritics) is significantly lower than for structured documents.
- Complexity: high — planned only after Phase 1 and Phase 2 are stable.

## Notes on scoping

Phase 2 and Phase 3 are split by **content type** (structured vs. handwritten), not by file format has both PDF and image inputs can appear in either phase depending on how "clean" the source document is. The handwriting case is deliberately deferred, since it carries the highest technical risk and lowest expected accuracy.