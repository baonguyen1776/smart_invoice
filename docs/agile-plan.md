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

- [ ] S0-01 Init Tauri v2 + React + TypeScript + Vite
- [ ] S0-02 4-layer folder structure (Presentation / Application / Domain / Infrastructure)
- [ ] S0-03 SQLite via `@tauri-apps/plugin-sql` + migration system
- [ ] S0-04 Initial migration: `Product`, `Unit`, `Invoice`, `InvoiceItem`
- [ ] S0-05 TypeScript strict mode, ESLint, Prettier
- [ ] S0-06 Test framework + build/typecheck script
- [ ] S0-07 `AGENTS.md` (rules above) + git branching convention

## Sprint 1 — Product Management (UC-02) (3-4 days)

**Agent split:** Gemini 3.8 Flash for CRUD/UI; Opus review on the soft-delete rule and the "≥1 Unit" validation.

- [ ] PRD-001 `Product` entity + validation
- [ ] PRD-002 `Unit` entity (owned by Product directly — no shared master table)
- [ ] PRD-003 Product repository (SQLite)
- [ ] PRD-004 Create Product (with ≥1 Unit required)
- [ ] PRD-005 Edit Product (name/category/units/prices)
- [ ] PRD-006 Soft Delete — acceptance criteria: deleted product does not appear in autocomplete, is not selectable for new invoices, but still shows correctly in invoice history
- [ ] PRD-007 Product list UI
- [ ] PRD-008 Duplicate product names allowed (per UC-02 E2), disambiguated by category in the UI

## Sprint 2 — Invoice Core (create + persist a real draft invoice) (4-5 days)

**Goal:** a cashier can create a draft invoice from the product catalog and it's actually saved in the DB.

**Agent split:** Opus for the unit-selection/price-fill logic and the search-index refresh strategy; Gemini 3.8 Flash for CRUD, dropdown UI, and Fuse.js wiring itself (well-documented library — a Build task, not a Review task).

- [ ] INV-001 Create Invoice (persisted, status = draft)
- [ ] INV-002 Add Invoice Item
- [ ] INV-003 Remove Invoice Item
- [ ] INV-004 Edit Item Quantity
- [ ] INV-005 Product search: build an in-memory Fuse.js index over Product + ProductAlias (not a DB query per keystroke); refresh the index whenever a Product is created/edited/deleted
- [ ] INV-006 Autocomplete dropdown UI, keyboard navigation (↑↓ + Enter), best match highlighted by default
- [ ] INV-007 Unit selection (auto-fill if 1 unit, prompt if multiple)
- [ ] INV-008 Item subtotal calculation (unit price × quantity)
- [ ] INV-009 Save Draft to DB

## Sprint 3 — Fast Invoice UX + Completion (3-4 days)

**Agent split:** Opus for the draft → completed state machine and the edit-completed confirm/overwrite flow; Gemini 3.8 Flash for keyboard UX, total calculation UI, and the confirm dialog component.

- [ ] UX-001 Keyboard navigation across the whole invoice form (focus management)
- [ ] UX-002 Enter-to-add-item flow
- [ ] UX-003 Inline price edit (VIP override)
- [ ] UX-004 Total amount calculation
- [ ] UX-005 Draft auto-save on semantic events (add item / edit quantity / edit price / remove item) — debounced, not on every keystroke
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
- [ ] Benchmark OCR/AI vendor candidates (Veryfi, Azure Document Intelligence) against: Vietnamese text, handwriting, line-item extraction, product name matching, image quality tolerance, latency, cost
- [ ] Decide `DocumentExtractor` implementation based on benchmark results, not free-tier convenience alone

---

## Definition of Done (per story)

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