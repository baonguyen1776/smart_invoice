# Smart Invoice

Smart Invoice is a PC-first desktop application for quickly creating and
printing sales invoices.

## MVP scope

- Manage products and their units (each unit owns its name and price).
- Search products with exact and fuzzy matching.
- Create, auto-save, complete, edit, and print invoices.
- Support manual price overrides, such as VIP pricing.
- Work offline with SQLite through Tauri v2.

The MVP does not track inventory quantities, manage suppliers, or include
cloud, ERP, accounting, CRM, e-commerce, payment, barcode hardware, or AI
forecasting features.

## Architecture

The project follows four layers:

```text
Presentation → Application → Domain
Infrastructure → Application/Domain interfaces
```

The stack is Tauri v2, React, TypeScript, Vite, SQLite, Fuse.js, and the
approved printer abstraction.
