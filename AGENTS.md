# AGENTS.md — Smart Invoice

This file is read by AI coding agents (OpenCode, and any model driving it —
Gemini 3.8 Flash, Claude Opus 4.6, etc.) working on this repository.

Follow it exactly.

If something here conflicts with a user instruction in a given session, the
live user instruction wins for that session, but the conflict must be
explicitly reported instead of being silently overridden.

---

## 1. Project Context — Read These First

Before implementing any story, read the following files when relevant:

* `README.md` — project summary and MVP scope
* `docs/use-cases/UC-01-invoice.md` — Create Invoice use case
* `docs/use-cases/UC-02-product-management.md` — Product Management use case
* `docs/architecture.md` — 4-layer architecture, tech stack, and
  locked scope decisions
* `docs/agile-plan.md` — current sprint, story list, and agent role assignment
* `CODING_CONVENTIONS.md` — naming, folder structure, and coding style rules

### Source of Truth

Project documentation is the source of truth for product scope,
architecture, domain model, and coding conventions.

Do not re-derive scope or architecture from first principles.

If the documentation does not define a required decision, stop and ask
the user rather than making assumptions.

If documentation conflicts with another documentation file, report the
conflict before proceeding.

If the live user instruction conflicts with this file, the live user
instruction wins for the current session, but the conflict must be reported.

---

## 2. Architecture

The project follows a strict 4-layer architecture:

```text
Presentation (React + TypeScript)
        ↓
Application (Use Cases)
        ↓
Domain (Entities + Business Rules)
        ↓
Infrastructure (SQLite, Fuse.js, Printer, AI/OCR)
```

### Layer Responsibilities

#### Presentation

Responsible for:

* React components
* Pages
* UI state
* User interaction
* Form handling
* Display formatting

Presentation must not:

* Execute SQL directly
* Contain domain business rules
* Access Infrastructure implementations directly when an Application
  use case exists

#### Application

Responsible for:

* Use cases
* Application workflows
* Coordinating Domain objects
* Calling repository/service interfaces
* Mapping application input/output

Application must not:

* Contain React/UI logic
* Depend on concrete Infrastructure implementations unnecessarily

#### Domain

Responsible for:

* Entities
* Value objects
* Business rules
* Domain invariants
* Domain-level validation

Domain must remain independent of:

* React
* Tauri UI APIs
* SQLite
* Fuse.js
* Printer implementations
* Other Infrastructure details

#### Infrastructure

Responsible for:

* SQLite persistence
* Tauri plugins
* Fuse.js integration
* Printer implementation
* AI/OCR integrations
* Implementations of interfaces required by inner layers

### Dependency Direction

Dependencies must point inward:

```text
Presentation → Application → Domain
Infrastructure → Application/Domain interfaces
```

Domain must never import Presentation or Infrastructure.

Application must not depend directly on Infrastructure implementations when
an interface/abstraction can be used.

Do not bypass layer boundaries.

---

## 3. Desktop and Technology Stack

The current technology stack is locked unless explicitly approved:

* Desktop shell: Tauri v2
* Frontend: React + TypeScript
* Database: SQLite
* SQLite integration: `@tauri-apps/plugin-sql`
* Search: Fuse.js
* Printer: `tauri-plugin-printer-v2`
* Printer abstraction: `PrinterService` interface

Do not replace or introduce an alternative technology without explicit
approval.

---

## 4. Locked Product Decisions

The following product decisions are locked for the MVP.

Do not revisit, reinterpret, or change them unless the user explicitly asks.

### Inventory

There is no inventory/stock quantity tracking in the MVP.

Never introduce:

* stock quantity
* current stock
* stock-in/stock-out quantity
* inventory balance
* automatic stock deduction
* low-stock alerts

### Supplier

There is no `Supplier` entity.

`Purchase` and `PurchaseItem` exist only to support AI import adding new
Products to the catalog.

Raw document-source metadata and source-scoped Product aliases may be retained
for matching, but they must not create Supplier CRUD or supplier-management
behavior.

Do not expand Purchase into a full supplier/inventory management system.

### Product Units

A Product owns its Units directly.

There is:

* no shared Unit master table
* no global Unit entity
* no unit conversion factor

Every active Product must have at least one active Unit. Units use soft
deactivation through `is_active`; never hard-delete a Unit referenced by
historical InvoiceItems.

### Persisted Value Representation

The MVP persistence contracts use:

* UUID v4 strings for Product, Unit, Invoice, and InvoiceItem identifiers
* non-negative safe-integer VND prices; signed safe-integer invoice amounts
* non-zero safe-integer InvoiceItem quantities (negative for returns/deductions)
* ISO-8601 UTC text timestamps
* optional Product SKU, brand, and category
* transaction-time product and Unit snapshots on InvoiceItem

Do not persist money as floating point or render historical InvoiceItems from
mutable Product/Unit display fields.

### Completed Invoice Editing

Editing a completed Invoice is allowed.

The flow must:

* require a confirmation dialog
* overwrite the existing Invoice record
* not create a separate version
* not create an audit trail

Do not introduce invoice versioning or audit history unless explicitly
requested.

### Product and Unit Deactivation

Products use soft delete only.

Use:

```text
is_active
```

Never hard-delete a Product.

Units also use `is_active` and are soft-deactivated for normal removal.

Do not use:

```sql
DELETE FROM Product ...
```

for normal Product deletion.

---

## 5. Scope Control

Only implement what belongs to the current story.

Do not:

* add unrelated features
* refactor unrelated modules
* redesign existing architecture
* introduce speculative abstractions
* "improve" unrelated code
* add future MVP features without being asked
* implement out-of-scope features

Keep changes focused and minimal.

If a task appears to require changes outside the current story, stop and
explain why before expanding the scope.

---

## 6. Story Execution Rules

Before implementing a story:

1. Read the relevant story in `docs/agile-plan.md`.
2. Read the related use case in `docs/use-cases/`.
3. Check the relevant architecture rules in `docs/architecture.md`.
4. Check `CODING_CONVENTIONS.md` for affected modules.
5. Identify the acceptance criteria.
6. Identify the affected layers/modules.
7. Implement only the required scope.
8. Add or update tests for changed business behavior.
9. Run the required verification commands.
10. Report exactly what changed and what was verified.

Do not implement requirements that are not stated in the story or supported
by the project documentation.

---

## 7. Stop and Ask

The agent must stop and ask the user before proceeding if:

* A requirement conflicts with a locked product decision.
* A change requires modifying the architecture or layer boundaries.
* A new Domain entity is required but is not defined in project documentation.
* A database schema change is required but the migration impact is unclear.
* A new dependency is required but there is no clear justification.
* Acceptance criteria are ambiguous or contradictory.
* The requested implementation would significantly affect modules outside
  the current story.
* The task requires choosing between multiple architectural approaches
  that are not already decided in the documentation.
* Existing project documentation is insufficient to make a safe decision.

Do not silently make architectural or product decisions.

---

## 8. Database and Migration Rules

Never change the database schema without adding a new numbered migration
file according to `CODING_CONVENTIONS.md` §6.

Never edit an already-applied migration.

For schema changes:

1. Create the next numbered migration.
2. Keep the migration focused on the current story.
3. Do not modify previous migrations.
4. Update related Domain/Application/Infrastructure code as required.
5. Add tests where applicable.
6. Verify the migration works against the current database state.

Do not manually modify the database schema outside the migration system.

---

## 9. Business Logic and Testing

Any new or modified business rule must have at least one automated test.

Tests should cover:

* expected behavior
* important validation rules
* relevant edge cases when applicable

Business logic must not be tested only through UI tests when it can be
tested directly at the Domain/Application level.

Do not create meaningless tests solely to satisfy the requirement.

---

## 10. Dependencies

Never introduce a new dependency without stating:

1. Why it is needed.
2. What problem it solves.
3. Why existing dependencies or native APIs are insufficient.
4. What it adds to the project.

Prefer existing dependencies and native platform APIs when they satisfy
the requirement.

Do not add a dependency merely for convenience.

A dependency addition requires explicit user approval unless the dependency
has already been approved in project documentation.

---

## 11. Git Rules

Never commit directly to `main`.

Work on a:

```text
feature/*
```

branch.

Keep commits focused on the current story.

Do not mix unrelated changes into the same branch or commit.

Before creating a commit or PR, ensure the working tree does not contain
unrelated modifications.

Do not rewrite or delete another agent's work without understanding why
the changes exist.

---

## 12. Code Quality Rules

Follow `CODING_CONVENTIONS.md` exactly.

Prefer:

* small focused functions
* clear naming
* explicit responsibilities
* SOLID principles where appropriate
* dependency inversion at architectural boundaries
* testable business logic
* minimal abstractions

Avoid:

* speculative abstractions
* unnecessary design patterns
* premature optimization
* duplicated business rules
* large god classes
* business logic inside React components
* direct database access from Presentation
* Infrastructure details leaking into Domain

Do not refactor code unrelated to the current story unless the refactor is
required to safely implement the story.

---

## 13. AI Agent Role Split

See `docs/agile-plan.md` for the complete role assignment.

### Build — Gemini 3.8 Flash / OpenCode

Responsible for:

* CRUD
* UI components
* migrations
* tests
* straightforward Application/Domain implementation
* well-documented library integrations such as Fuse.js

Build agents must not:

* redefine product scope
* change locked architecture
* change locked product decisions
* silently introduce dependencies
* perform unrelated refactors

### Review — Claude Opus 4.6

Used selectively because quota is limited.

Responsible for reviewing:

* Domain modeling
* state machines
* invoice draft/completed state
* transaction integrity
* cross-module architecture
* hard bugs
* architectural risks

Review agents may identify problems and propose changes.

They must not silently expand product scope.

### Orchestrate — OpenCode

Responsible for:

* coordinating the implementation loop
* applying approved changes
* running verification commands
* checking scope
* reporting results

The orchestrator must not silently override locked project decisions.

---

## 14. Verification

A story may only be marked **Done** after all applicable verification
checks pass.

### Frontend

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

### Rust / Tauri

When Rust/Tauri code is changed, also run:

```bash
cargo fmt --check
cargo clippy
cargo test
```

Do not mark a story Done if a required verification command fails.

If a verification command cannot be executed because of an environment
problem, report it explicitly instead of claiming the story is Done.

---

## 15. Completion Report

When reporting a finished task, always include:

### (a) What Changed

Briefly describe the implementation.

### (b) Files Touched

List every file created, modified, or deleted.

### (c) Verification

Report the exact commands executed and their results.

Example:

```text
Verification:
- npm run typecheck — passed
- npm run lint — passed
- npm run test — passed
- npm run build — passed
```

If Rust/Tauri code was changed:

```text
- cargo fmt --check — passed
- cargo clippy — passed
- cargo test — passed
```

Do not report only:

```text
Done.
```

A task is not considered complete without verification evidence.

---

## 16. Out of Scope for MVP

Do not build the following unless explicitly asked:

* Cloud backend
* Multi-branch support
* ERP integration
* Accounting integration
* CRM integration
* E-commerce integration
* Payment gateway
* Advanced analytics
* AI forecasting
* Barcode hardware
* Inventory/stock quantity tracking
* Supplier management

These are outside the current MVP scope.

---

## 17. Final Principle

When in doubt:

```text
Read the documentation.
Stay within the current story.
Respect the architecture.
Respect locked product decisions.
Prefer the smallest correct change.
Test business behavior.
Verify everything.
Ask before making an undefined decision.
```

The user makes product and architectural decisions.

AI agents implement, review, and orchestrate those decisions — they do not
silently redefine them.
