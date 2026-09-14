# Smart Invoice — Coding Conventions

This document defines how code is written in this project.

It applies to every contributor — human or AI agent.

See:

* `docs/architecture.md` for architectural rationale and layer boundaries.
* `AGENTS.md` for AI-specific operating rules.
* `docs/use-cases/` for business flows and acceptance behavior.

When these conventions conflict with an explicit user instruction for the
current session, the live user instruction wins, but the conflict must be
reported.

---

## 1. Folder Structure

The folder structure maps directly to the 4-layer architecture:

```text
src/                              # Frontend

├── presentation/                 # Presentation layer
│   ├── screens/                  # InvoiceScreen, ProductScreen, ...
│   ├── components/               # Reusable UI components
│   └── hooks/                    # UI-only hooks
│
├── application/                  # Application layer
│   └── use-cases/                # CreateInvoice, AddInvoiceItem,
│                                 # SearchProduct, ...
│
├── domain/                       # Domain layer
│   ├── entities/                 # Product, Unit, Invoice, InvoiceItem, ...
│   └── rules/                    # Pure business rules, no I/O
│
└── infrastructure/               # Infrastructure layer
    ├── repositories/             # SQLite-backed repositories
    ├── search/                   # Fuse.js integration
    ├── printer/                  # PrinterService + adapter
    └── db/                       # Database connection + migrations

src-tauri/                        # Rust / Tauri backend
```

### Layer Rules

A file's location determines what it is allowed to import.

### Presentation

May import:

* Application use cases
* Domain types when needed for rendering
* Presentation components/hooks

Must not:

* Execute SQL directly
* Import SQLite/Tauri database implementations directly
* Contain business rules
* Depend on Infrastructure implementation details

### Application

May import:

* Domain entities
* Domain rules
* Application-level types/interfaces

Infrastructure dependencies must be accessed through abstractions/interfaces.

Do not depend directly on concrete Infrastructure implementations.

### Domain

May import only domain-safe code.

Domain must not import:

* React
* Tauri
* SQLite
* Fuse.js
* Printer implementations
* Infrastructure
* Presentation
* Browser APIs
* UI-specific code

Domain code should remain deterministic and free of I/O.

### Infrastructure

Responsible for implementing technical concerns such as:

* SQLite persistence
* Search
* Printing
* AI/OCR integration
* Tauri plugin integration

Infrastructure may import Domain and Application abstractions when required
to implement them.

### Dependency Direction

The intended dependency direction is:

```text
                    ┌───────────────┐
                    │ Presentation  │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │  Application  │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │    Domain     │
                    └───────────────┘

Infrastructure implements the abstractions required by
Application/Domain and connects the application to external systems.
```

Never bypass the Application and Domain boundaries merely because doing so
is shorter.

---

## 2. Naming Conventions

| Item                 | Convention                             | Example                        |
| -------------------- | -------------------------------------- | ------------------------------ |
| React component file | PascalCase                             | `InvoiceScreen.tsx`            |
| React component      | PascalCase                             | `InvoiceScreen`                |
| Hook                 | camelCase with `use` prefix            | `useProductSearch.ts`          |
| Use case             | PascalCase, verb-first                 | `CreateInvoice.ts`             |
| Domain entity        | PascalCase, singular noun              | `Product.ts`, `InvoiceItem.ts` |
| Domain rule          | PascalCase, descriptive                | `CalculateInvoiceTotal.ts`     |
| Repository           | PascalCase + `Repository`              | `ProductRepository.ts`         |
| Service abstraction  | PascalCase                             | `PrinterService.ts`            |
| SQLite table         | snake_case, plural                     | `products`, `invoice_items`    |
| SQLite column        | snake_case                             | `unit_price`, `created_at`     |
| Variable             | camelCase                              | `invoiceTotal`                 |
| Function             | camelCase                              | `calculateSubtotal()`          |
| Constant             | UPPER_SNAKE_CASE                       | `MAX_SEARCH_RESULTS`           |
| Boolean              | descriptive `is/has/can/should` prefix | `isActive`, `hasItems`         |
| Event handler        | `handle` prefix                        | `handleSubmit`                 |

Do not use the `I` prefix for interfaces.

Use:

```ts
interface PrinterService {}
```

not:

```ts
interface IPrinterService {}
```

---

## 3. TypeScript

### Strictness

TypeScript strict mode must remain enabled:

```json
{
  "strict": true
}
```

Do not disable strict mode.

Do not use:

```ts
// @ts-ignore
```

unless there is a documented technical reason immediately explaining why.

### `any`

Do not use `any`.

Prefer:

```ts
unknown
```

and narrow the value safely.

If a value has a known structure, define a proper type.

### `interface` vs `type`

Use `interface` when describing extendable object contracts or service/
repository contracts.

Example:

```ts
interface ProductRepository {
  findById(id: string): Promise<Product | null>;
}
```

Use `type` for:

* unions
* intersections
* function signatures
* mapped/conditional types
* simple aliases

Example:

```ts
type InvoiceStatus = "draft" | "completed";
```

Do not choose `interface` or `type` based only on whether something is an
entity.

Choose based on the role of the type.

### Exports

React components should use named exports.

Prefer:

```ts
export function InvoiceScreen() {}
```

over:

```ts
export default InvoiceScreen;
```

Named exports make imports easier to search, refactor, and analyze.

---

## 4. React

### Components

Use functional components only.

Do not use class components.

One primary component per file.

The file name should match the component name.

Example:

```text
InvoiceScreen.tsx
```

contains:

```ts
export function InvoiceScreen() {}
```

### Business Logic

Business logic must not live inside React components.

Do not put:

* invoice total calculations
* pricing rules
* quantity validation
* invoice state-transition rules
* product business rules

directly inside components.

These belong in:

```text
domain/
application/use-cases/
```

Components should coordinate user interaction and render application
results.

### UI State

Use local React state for UI-only state, such as:

* dropdown open/closed
* focused item index
* temporary input state
* keyboard navigation state
* modal visibility

Application/domain state should not be duplicated unnecessarily inside
components.

For example, an invoice draft may temporarily exist in UI state while the
user is editing it. Persistence decisions belong to the Application layer.

Do not force every piece of state through a repository merely because it
exists beyond a single component.

---

## 5. Application Use Cases

Use cases represent application actions.

Examples:

```text
CreateInvoice
AddInvoiceItem
RemoveInvoiceItem
CompleteInvoice
EditCompletedInvoice
SearchProduct
CreateProduct
UpdateProduct
DeactivateProduct
```

Use cases should:

* orchestrate application workflows
* validate application-level input
* call Domain rules
* coordinate repositories/services through abstractions
* return clear results/errors

Use cases should not:

* render UI
* manipulate React state
* directly access DOM APIs
* contain SQLite-specific queries
* depend on concrete Infrastructure implementations

Keep use cases focused on one application action.

---

## 6. Domain

Domain code contains business meaning and rules.

Examples:

```text
Product
Unit
Invoice
InvoiceItem
```

and rules such as:

```text
CalculateSubtotal
CalculateInvoiceTotal
ValidateInvoiceItem
ValidateProduct
```

### Domain Rules

Domain rules must be:

* deterministic
* testable
* independent of I/O
* independent of React/Tauri
* independent of SQLite

Do not put database queries, HTTP requests, printer calls, or UI logic
inside Domain entities/rules.

### Domain Invariants

Business invariants should be enforced as close to the Domain as practical.

Do not rely exclusively on UI validation for business-critical rules.

---

## 7. Rust / Tauri

Tauri commands must remain thin.

A Tauri command should:

1. Receive input.
2. Call the appropriate Application use case or Infrastructure service.
3. Convert the result into the required Tauri response.
4. Return the result/error.

Do not put business logic directly inside Tauri commands.

### Error Handling

Use:

```rust
Result<T, Error>
```

for operations that can fail.

Avoid:

```rust
unwrap()
expect()
```

in production code.

They are allowed in:

* tests
* controlled initialization paths such as `main()`

provided their use is justified by the context.

### Module Structure

Keep Rust modules separated by technical/domain concern.

Prefer:

```text
src-tauri/src/
├── main.rs
├── db.rs
├── printer.rs
└── ...
```

over putting unrelated functionality into one large `main.rs`.

---

## 8. Database / Migrations

All database schema changes must go through numbered migrations.

Never modify an already-applied migration.

Migration format:

```text
NNNN_description.sql
```

Examples:

```text
0001_init_schema.sql
0002_add_product_alias.sql
0003_add_invoice_status.sql
```

### Migration Rules

* Use the next available migration number.
* Keep each migration focused.
* Never edit a migration that may already have been applied.
* Never manually change the schema outside the migration mechanism.
* Update affected repository/domain/application code when required.
* Add tests for behavior affected by schema changes.

### Soft Delete

Products and their owned Units use soft deactivation:

```text
is_active
```

Never hard-delete Products or historically referenced Units during normal
application behavior.

Do not use:

```sql
DELETE FROM products
```

for Product deletion.

### Persisted Value Representation

Follow the field-level contract in `docs/architecture.md` §19:

- Domain IDs are UUID v4 strings stored as SQLite `TEXT`.
- Persist money as integer VND using SQLite `INTEGER`; never use `REAL` or a
  floating-point persisted money value.
- Validate TypeScript monetary values with `Number.isSafeInteger` and the
  Domain range rules before persistence.
- Invoice quantities are non-zero safe integers; negative quantities represent
  returns/deductions under UC-01 A3. Invoice amounts may be signed; prices remain
  non-negative.
- Store timestamps as canonical ISO-8601 UTC `TEXT` values.
- Encode SQLite booleans as `0`/`1` and enforce the allowed values with a
  database constraint.
- Enable SQLite foreign-key enforcement for every connection.
- Invoice history renders InvoiceItem snapshot fields rather than mutable
  Product/Unit catalog values.

### Aggregate Transactions

Repository implementations must keep aggregate writes atomic. In particular:

- Product and all owned Unit changes are one transaction.
- Invoice draft semantic edits write items and recalculated totals together.
- Invoice completion writes validated items, total, status, and completion time
  together.
- Confirmed completed-invoice overwrite replaces items and total in one
  transaction while preserving the documented invoice identity fields.

On failure, roll back the complete operation and retain useful diagnostic
context. Do not return raw SQLite rows or raw database errors across the
Infrastructure boundary.

---

## 9. Testing

Testing must focus on behavior, not implementation details.

### Domain / Application

New business logic in:

```text
domain/
application/use-cases/
```

must include tests.

For a new business rule or use case, tests should normally cover:

1. The main/success flow.
2. At least one relevant edge or exception case from the corresponding
   Use Case.

Example:

```text
CreateInvoice
├── valid invoice → succeeds
└── invalid/empty invoice → rejected
```

Tests should reflect actual business requirements.

Do not create meaningless tests merely to satisfy coverage requirements.

### UI

UI components should be tested when they contain meaningful behavior.

Examples:

* keyboard navigation
* autocomplete selection
* modal confirmation behavior
* complex user interaction
* conditional rendering driven by meaningful state

Do not write tests solely for static layout or styling.

---

## 10. Git

### Branching

`main` must remain deployable.

All work happens on:

```text
feature/<short-description>
```

Examples:

```text
feature/product-crud
feature/invoice-autocomplete
feature/edit-completed-invoice
```

Merge changes through a PR/self-review before merging into `main`.

### Commit Messages

Use Conventional Commits.

Examples:

```text
feat: add product autocomplete dropdown
fix: prevent negative invoice quantity
chore: configure eslint
refactor: extract price calculation to domain rule
test: add invoice validation tests
```

### Commit Scope

One logical change per commit.

Do not mix unrelated changes.

For example, do not combine:

```text
schema migration
+
unrelated UI redesign
```

in one commit.

A migration and the code required to support that migration may belong to
the same logical story/commit when appropriate.

---

## 11. Formatting and Linting

### TypeScript / React

Prettier and ESLint are the source of truth.

Do not manually fight the formatter.

Run:

```bash
npm run lint
```

before considering a story complete.

If a formatting command exists in `package.json`, use the project's
configured command rather than introducing a new formatting tool.

### Rust

Use:

```bash
cargo fmt
cargo clippy
```

before considering Rust/Tauri work complete.

---

## 12. Comments and Documentation

Prefer self-explanatory code over excessive comments.

Comments should explain:

* why something is necessary
* non-obvious business constraints
* architectural decisions
* workarounds for external limitations

Do not write comments that merely restate the code.

Bad:

```ts
// Increment quantity
quantity += 1;
```

Good:

```ts
// Completed invoices overwrite the existing record by product decision;
// no invoice version history is maintained in the MVP.
```

Do not remove useful architectural/business comments merely to reduce
line count.

---

## 13. Error Handling

Errors should be explicit and meaningful.

Avoid silently swallowing errors:

```ts
try {
  ...
} catch {
  // do nothing
}
```

Prefer handling the error appropriately or propagating it.

User-facing errors should be understandable.

Internal errors should retain enough context for debugging.

Do not expose raw database errors directly to end users unless appropriate.

---

## 14. Dependency Rules

Before adding a dependency, verify:

1. The requirement cannot reasonably be solved with existing dependencies.
2. A native API is not sufficient.
3. The dependency has a clear purpose.
4. The dependency is compatible with the current architecture.
5. The dependency is justified in the task/PR description.

Do not add libraries simply for convenience.

Do not introduce a second library that duplicates functionality already
provided by the project.

---

## 15. Refactoring

Refactoring is allowed when required to safely implement the current story.

Do not perform unrelated large-scale refactors during feature work.

Avoid changing:

* architecture
* naming conventions
* folder structure
* unrelated modules
* dependency choices

unless explicitly required or approved.

If a refactor is substantial enough to become a separate concern, stop and
propose it rather than silently expanding the story.

---

## 16. File and Module Rules

Keep files focused.

Avoid:

* giant components
* giant use cases
* giant repository classes
* unrelated utility dumping grounds
* circular dependencies
* duplicated business logic

If a module becomes difficult to understand, consider splitting it by
responsibility — but only when it is relevant to the current story.

---

## 17. Architecture Compliance Checklist

Before finalizing a change, verify:

```text
[ ] Correct layer
[ ] Correct folder
[ ] No Presentation → direct Infrastructure access
[ ] No Domain → Infrastructure dependency
[ ] No business logic inside React components
[ ] No SQL inside Presentation/Application business logic
[ ] Infrastructure details remain behind abstractions
[ ] No unrelated refactoring
[ ] No unauthorized dependency
[ ] No schema change without a new migration
[ ] Product deletion remains soft delete
```

---

## 18. Final Principle

Prefer code that is:

```text
Simple
Explicit
Testable
Maintainable
Architecturally consistent
```

The goal is not to maximize abstraction.

The goal is to implement the required behavior with the smallest clear
design that respects the project's architecture and business rules.
