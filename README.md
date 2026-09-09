# Smart Invoice

Smart Invoice is a PC-first desktop application for quickly creating and
printing sales invoices.

## MVP scope

- Manage products with optional SKU/brand/category and directly owned units
  (each unit owns its name and integer-VND price).
- Search products with exact and fuzzy matching.
- Create, auto-save, complete, edit, and print invoices.
- Support manual price overrides, such as VIP pricing.
- Work offline with SQLite through Tauri v2.

The MVP does not track inventory quantities, manage suppliers, or include
cloud, ERP, accounting, CRM, e-commerce, payment, barcode hardware, or AI
forecasting features.

Product names may be duplicated and are disambiguated by optional SKU, brand,
and category. Product and Unit catalog removal is soft deactivation so invoice
history remains intact. Invoice items retain transaction-time identity and
price snapshots rather than reading mutable catalog values.

Post-MVP purchase-document AI may use raw issuer metadata to scope confirmed
Product aliases, but this does not introduce Supplier management. AI extracts
and suggests; a human must confirm every Product match or creation.

## Architecture

The project follows four layers:

```text
Presentation → Application → Domain
Infrastructure → Application/Domain interfaces
```

The stack is Tauri v2, React, TypeScript, Vite, SQLite, Fuse.js, and the
approved printer abstraction.

## Quality requirements

Measurable performance, reliability, recovery, security, compatibility, and
accessibility targets are maintained in
[`docs/non-functional-requirements.md`](docs/non-functional-requirements.md).
Targets marked `Proposed` are not binding until human approval.

Issue test results, benchmarks, and rerun commands: [verification notes](docs/testing/issues.md).
