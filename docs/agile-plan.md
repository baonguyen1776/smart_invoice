# Smart Invoice — Agile Plan (Solo Dev + AI Agents)

## AI Agent Roles

| Tool | Role | Notes |
|---|---|---|
| OpenCode (CLI, installed) | Orchestrate + verify — runs daily, checks agent work | Provider-agnostic terminal agent |
| Gemini 3.8 Flash | Build — CRUD, UI components, boilerplate, migrations, Fuse.js integration, tests | Fast, cheap, strong on well-specified engineering tasks |
| Claude Opus 4.6 (via Antigravity) | Review — domain modeling, state machines, transaction logic, architecture review, hard bugs | Claude quota inside Antigravity is tightly limited (multi-day lockouts reported after hitting the 5-hour limit) — reserve for high-value ambiguity/complexity, not routine CRUD or well-documented library integration (e.g. Fuse.js itself is a Build task, not a Review task) |

## Methodology

Solo Kanban-Scrum hybrid — no team ceremonies, tight feedback loop.

- Sprint length: 3-5 days
- Each sprint targets one **business capability**, broken into small stories that are each independently testable — a sprint is not "one big feature", it's a stack of small Done increments
- Daily personal check-in: update Kanban (To Do / Doing / Done), note blockers
- Sprint Review: demo the working feature against the agreed Use Case
- Sprint Retro: note which agent handled which task well, adjust split for next sprint

## Confirmed decisions (locked before Sprint 0)

- **Product-Unit model:** simple — `Product` has N `Unit`, each `Unit` owns its own name + price directly. No shared Unit master table, no conversion factor (no use case for it since inventory quantity is not tracked).
- **Editing a completed invoice:** allowed — requires a confirmation dialog, then overwrites the existing record. No separate audit-trail versioning.
- **No inventory quantity tracking, no Supplier entity** (per `docs/architecture.md`).
- **Domain identifiers:** UUID v4 strings for Product, Unit, Invoice, and
  InvoiceItem; invoices also receive a positive user-facing integer number.
- **Money and quantity:** integer VND money and non-zero integer invoice
  quantity (positive for sales, negative for returns/deductions per Issue #28);
  persisted floating-point money is forbidden.
- **Catalog identity:** duplicate Product names remain valid; optional SKU,
  brand, and category disambiguate products. Product and Unit removal is soft
  deactivation.
- **Historical invoices:** InvoiceItem stores transaction-time Product/Unit
  identity and price snapshots.
- **AI matching context:** source-scoped aliases may use document-issuer
  metadata without introducing a Supplier entity. Every AI result requires
  human confirmation.

## Implementation sequencing

The dependency order for the next foundation/Product increments is locked:

```text
#6 Domain and persistence contracts
        ↓
#5 Product Domain/Application + repository abstraction
        ↓
#4 SQLite migration + Product repository implementation
```

Issue #4 must not invent a persistence contract, and it must implement the
repository abstraction delivered by #5.

## AI Agent Rules (goes into `AGENTS.md`)

```text
1. Never change architecture without approval.
2. Never modify unrelated modules.
3. Never change database schema without a migration.
4. Never commit directly to main.
5. Never mark a story Done without verification (typecheck/lint/tests/build).
6. Never bypass the Domain/Application layer boundaries.
7. Never introduce a dependency without justification.
8. AI-generated business logic must have tests.
9. Report what changed and which commands verify it — "Done." alone is not acceptable.
```

`AGENTS.md` should also document: architecture rules, coding/naming conventions,
where business logic lives, how DB migrations work, and what agents must not touch.

---

## Sprint 0 — Foundation (1-2 days)

**Agent split:** Gemini 3.8 Flash + OpenCode for scaffolding; Opus for a one-time review of the folder structure against the 4-layer architecture.

- [x] S0-01 Init Tauri v2 + React + TypeScript + Vite
- [x] S0-02 4-layer folder structure (Presentation / Application / Domain / Infrastructure)
- [x] S0-03 SQLite migration system (Rust-managed sqlx pool per #4)
- [x] S0-04 Initial four-table migration: `products`, `units`, `invoices`,
  `invoice_items` using the approved contract in `docs/architecture.md` §19
- [x] S0-05 TypeScript strict mode, ESLint, Prettier
- [x] S0-06 Test framework + build/typecheck script
- [x] S0-07 `AGENTS.md` (rules above) + git branching convention

## Sprint 1 — Product Management (UC-02) (3-4 days)

**Agent split:** Gemini 3.8 Flash for CRUD/UI; Opus review on the soft-delete rule and the "≥1 Unit" validation.

- [x] PRD-001 `Product` entity + validation (including optional SKU/brand and
  duplicate-name support)
- [x] PRD-002 `Unit` entity (owned by Product directly, soft-deactivated — no shared master table)
- [x] PRD-003 Product repository abstraction first (#5), followed by its atomic SQLite implementation (#4)
- [x] PRD-004 Create Product (with ≥1 Unit required)
- [x] PRD-005 Edit Product (name/SKU/brand/category/units/prices; at least one active Unit remains)
- [x] PRD-006 Soft Delete — acceptance criteria: deleted product does not appear in autocomplete, is not selectable for new invoices, but still shows correctly in invoice history
- [x] PRD-007 Product list UI
- [x] PRD-008 Duplicate product names allowed (per UC-02 E2), disambiguated by SKU/brand/category in the UI

## Sprint 2 — Invoice Core (create + persist a real draft invoice) (4-5 days)

**Goal:** a cashier can create a draft invoice from the product catalog and it's actually saved in the DB.

**Agent split:** Opus for the unit-selection/price-fill logic and the search-index refresh strategy; Gemini 3.8 Flash for CRUD, dropdown UI, and Fuse.js wiring itself (well-documented library — a Build task, not a Review task).

- [x] INV-001 Create Invoice (persisted, status = draft)
- [x] INV-002 Add Invoice Item
- [x] INV-003 Remove Invoice Item
- [x] INV-004 Edit Item Quantity
- [x] INV-005 Add ProductAlias through a new numbered migration, then build an
  in-memory Fuse.js index over Product + ProductAlias (not a DB query per
  keystroke); refresh the index whenever a Product is created/edited/deactivated
- [x] INV-006 Autocomplete dropdown UI, keyboard navigation (↑↓ + Enter), best match highlighted by default
- [x] INV-007 Unit selection (auto-fill if 1 unit, prompt if multiple)
- [x] INV-008 Item subtotal calculation (unit price × quantity)
- [x] INV-009 Save Draft to DB

## Sprint 3 — Fast Invoice UX + Completion (3-4 days)

**Agent split:** Opus for the draft → completed state machine and the edit-completed confirm/overwrite flow; Gemini 3.8 Flash for keyboard UX, total calculation UI, and the confirm dialog component.

- [x] UX-001 Keyboard navigation across the whole invoice form (focus management)
- [x] UX-002 Enter-to-add-item flow
- [x] UX-003 Inline price edit (VIP override)
- [x] UX-004 Total amount calculation
- [x] UX-005 Draft auto-save on semantic events (add item / edit quantity / edit price / remove item) — debounced, not on every keystroke
- [x] UX-008 Allow negative-quantity return/deduction lines in invoices (Issue #28)
- [ ] UX-009 UI Refactoring & Design System: standardize buttons, colors, and polish overall interface (Issue #35)
- [ ] UX-006 Complete Invoice (status draft → completed)
- [ ] UX-007 Edit a completed invoice: confirmation dialog, then overwrite on save (confirmed decision — kept in MVP)

## Sprint 4 — Printing (2-3 days)

**Agent split:** Opus for the `PrinterService` abstraction (confirm it doesn't leak vendor detail into Domain); Gemini 3.8 Flash + OpenCode for the plugin wiring itself.

- [ ] PRINT-001 Technical spike with the real printer hardware first (confirm normal/PDF printer vs 58/80mm thermal) before writing adapter code
- [ ] PRINT-002 `PrinterService` interface
- [ ] PRINT-003 Adapter implementation (`tauri-plugin-printer-v2`)
- [ ] PRINT-004 Print a completed invoice

**Milestone after Sprint 4:** a complete, demoable PC application — product search → select → auto price → quantity → complete → print — with no AI, no inventory tracking needed to show value.

## Sprint 5+ — AI Purchase Document Import Spike (post-MVP)

- [ ] Collect 50-100 real purchase documents (mixed structured + handwritten)
- [ ] Label document header/table/footer regions so issuer identity is not confused with footer printer/designer branding
- [ ] Benchmark OCR/AI vendor candidates (Veryfi, Azure Document Intelligence) against: Vietnamese text, handwriting, source identity, line-item extraction, product name matching, image quality tolerance, latency, cost
- [ ] Evaluate exact SKU, source-scoped alias, global alias, and Fuse.js candidate stages before adding learned reranking
- [ ] Validate mixed documents containing matched, ambiguous, and new-candidate lines through human review
- [ ] Persist confirmed source/alias mappings as training evidence; do not fine-tune without a labeled benchmark showing a need
- [ ] Decide `DocumentExtractor` implementation based on benchmark results, not free-tier convenience alone

---

## Definition of Done (per story)

Applicable approved requirements in
[`non-functional-requirements.md`](non-functional-requirements.md) are part of
the story Definition of Done. Proposed targets require human approval before
they become delivery gates.

- [ ] Feature runs and matches the agreed Use Case flow
- [ ] Code respects the 4-layer boundaries (no direct SQL in Presentation, no UI logic in Domain)
- [ ] Manually tested against the relevant UC main/alternate/exception flows
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Automated tests pass (for any new business logic)
- [ ] Build succeeds
- [ ] No unrelated files modified
- [ ] DB migration tested (if schema changed)
- [ ] Error state tested (e.g. no search match, empty required field)
- [ ] Agent reports what changed and which commands verify it
