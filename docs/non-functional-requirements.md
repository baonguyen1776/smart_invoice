# Smart Invoice — Non-Functional Requirements

## 1. Purpose

This document is the single source of truth for measurable quality requirements
for the Smart Invoice MVP. Functional scope remains defined by the use cases;
these requirements define how well that scope must operate.

Targets remain **Proposed** until human review changes their status to
**Approved**. The Product lookup, Product write, catalog-load, SQLite
initialization, and database-lock targets were approved by the project owner on
2026-09-09.

## 2. Status and measurement rules

| Status | Meaning |
|---|---|
| Proposed | Candidate target awaiting human approval |
| Approved | Locked target required for the relevant release |
| Deferred | Explicitly postponed beyond the MVP |

- `P95` means at least 95% of measured operations complete within the target.
- `Maximum` is the hard acceptance ceiling for a single measured operation,
  excluding an explicitly injected database-lock test.
- Performance measurements use release/debug-production builds, not a Vite
  development server.
- Tests run after one warm-up pass and report dataset size, operating system,
  hardware, sample count, median, and P95.
- A requirement without recorded evidence is not considered verified.

## 3. Reference environment

The proposed minimum reference environment is:

| Item | Proposed baseline |
|---|---|
| CPU | 4 logical cores, x86_64 or Apple silicon |
| Memory | 8 GB RAM |
| Storage | SSD with at least 2 GB free for application data |
| Display | 1366 × 768 |
| Windows | Windows 10 22H2 or newer |
| macOS | macOS 13 or newer |
| Linux | Ubuntu 22.04 LTS or newer |

The printer/output baseline remains deferred until the Sprint 4 hardware spike.

## 4. Performance

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-PERF-001 | Cold start reaches an interactive primary screen within 3 seconds P95 on the reference environment. | Automated or instrumented startup benchmark with at least 20 runs per supported OS. | MVP | Proposed |
| NFR-PERF-002 | An exact Product lookup by ID, or by SKU when supported, completes within 50 ms P95 and 200 ms maximum with 10,000 Products and 50,000 Units. | Disposable SQLite benchmark with at least 100 indexed lookups. | MVP | Approved |
| NFR-PERF-003 | Product autocomplete returns candidates within 100 ms P95 and 300 ms maximum for a 10,000-Product catalog after the in-memory index is ready. | Search benchmark introduced with `INV-005`. | MVP | Approved |
| NFR-PERF-004 | Initial loading of 10,000 active Products into the in-memory search index completes within 500 ms P95 and 1 second maximum. | Release-build startup benchmark with at least 20 catalog-load runs. | MVP | Approved |
| NFR-PERF-005 | A Product create, update, or deactivate transaction completes within 200 ms P95 and 1 second maximum. | Disposable SQLite benchmark with at least 100 operations of each type. | MVP | Approved |
| NFR-PERF-006 | SQLite initialization completes within 500 ms P95 and 1 second maximum on the reference environment. | Release-build startup benchmark with at least 20 fresh-process runs. | MVP | Approved |
| NFR-PERF-007 | A semantic draft-save operation completes within 300 ms P95 for an Invoice containing up to 100 items. | Integration benchmark introduced with draft auto-save. | MVP | Proposed |
| NFR-PERF-008 | Memory usage remains below 300 MB after 30 minutes of normal Product and Invoice workflows on the reference environment. | Manual release-build soak test with recorded process memory. | MVP | Proposed |

### 4.1 Connection and query strategy

The approved implementation constraints for meeting these targets are:

- Initialize SQLite once during application startup and reuse the same
  application-scoped connection or bounded pool. Do not reconnect for each
  Product lookup.
- Enable foreign-key enforcement and a 2-second busy timeout when each physical
  connection is created.
- Use indexed SQLite lookup for exact ID/SKU access. Maintain indexes for
  `Product.id`, `Product.sku`, `Product.is_active`, and `Unit.product_id`.
- Load the active Product catalog once for Fuse.js search and refresh the index
  after committed Product changes. Do not reload the full catalog for each
  keystroke.
- Persist Product and owned Unit changes in one transaction.

## 5. Reliability and data integrity

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-REL-001 | Product and all owned Unit writes are atomic: an injected failure at any write step leaves zero partial changes. | Repository integration tests against a disposable SQLite database. | MVP | Proposed |
| NFR-REL-002 | Every database connection enables foreign-key enforcement before application queries execute. | Startup/integration test reads `PRAGMA foreign_keys` and expects `1`. | MVP | Proposed |
| NFR-REL-003 | Successfully committed data survives application restart and an abnormal process termination. | Crash-recovery test that writes, terminates, reopens, and compares records. | MVP | Proposed |
| NFR-REL-004 | The application never reports success before the corresponding database transaction commits. | Failure-injection integration tests and Application result assertions. | MVP | Proposed |
| NFR-REL-005 | Completed historical Invoice display never changes after Product or Unit edits/deactivation. | Integration tests render and compare InvoiceItem snapshots. | MVP | Proposed |
| NFR-REL-006 | When SQLite remains locked, an operation waits no longer than the configured 2-second busy timeout before returning a mapped persistence failure. | Hold a conflicting lock, measure timeout behavior, and assert the mapped error. | MVP | Approved |

## 6. Migration safety

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-MIG-001 | A numbered migration applies cleanly to an empty database and is not reapplied after successful registration. | Automated migration-startup test run twice against the same disposable database. | MVP | Proposed |
| NFR-MIG-002 | A failed migration prevents normal application startup and retains diagnostic context without exposing raw SQL to the user. | Inject a failing test migration and assert startup/error mapping behavior. | MVP | Proposed |
| NFR-MIG-003 | Applied migration files are immutable; later schema changes use a new forward migration. | Pull-request review and migration checksum/diff review. | MVP | Proposed |
| NFR-MIG-004 | Before release, migration tests cover both a fresh database and upgrade from the latest released schema. | CI integration test once a released schema exists. | MVP | Proposed |

The initial migration is treated as irreversible because automatically dropping
all MVP tables would destroy user data. Recovery uses backup/restore or a later
forward migration rather than an automatic destructive down migration.

## 7. Offline operation

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-OFF-001 | Product management, invoice creation/edit/completion/history, and printing do not require an internet connection. | Execute the MVP acceptance suite with network access disabled. | MVP | Proposed |
| NFR-OFF-002 | Network-dependent post-MVP AI failures do not prevent local Product or Invoice workflows. | Integration test with the AI boundary unavailable. | Post-MVP | Proposed |
| NFR-OFF-003 | Core workflows do not initiate undocumented outbound network requests. | Release-build network inspection during the offline acceptance suite. | MVP | Proposed |

## 8. Backup and recovery

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-REC-001 | Backup includes the SQLite database and metadata required to restore the same application state. | Restore a backup into a clean profile and compare record counts and representative invoices. | MVP | Proposed |
| NFR-REC-002 | Proposed recovery point objective is 24 hours when daily backup is enabled. | Timestamp comparison between the latest valid backup and simulated failure. | MVP | Proposed |
| NFR-REC-003 | Proposed recovery time objective is 30 minutes for a trained owner using documented restore steps. | Timed manual recovery exercise. | MVP | Proposed |
| NFR-REC-004 | Restore validates backup integrity before replacing the active database. | Corrupt-backup test must fail without modifying active data. | MVP | Proposed |

Backup implementation requires a separate story; these requirements define its
expected behavior and do not add it to issue #4.

## 9. Security and privacy

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-SEC-001 | The database is stored only in the operating-system application-data directory and is not written to the project/install directory. | Platform integration test records and checks the resolved database path. | MVP | Proposed |
| NFR-SEC-002 | Tauri capabilities grant only the SQL/database operations and paths required by approved workflows. | Capability-file review and negative permission tests. | MVP | Proposed |
| NFR-SEC-003 | Presentation never receives raw SQL, database rows, stack traces, or driver errors. | Repository/Application error-mapping tests. | MVP | Proposed |
| NFR-SEC-004 | Logs exclude full invoice contents and other business-sensitive payloads by default. | Automated log-content test plus manual review. | MVP | Proposed |
| NFR-SEC-005 | Database-at-rest encryption remains Deferred until a threat model and key-management approach are approved. | Architecture/security decision review. | Post-MVP | Deferred |

## 10. Observability and supportability

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-OBS-001 | Persistence failures retain operation name and safe context sufficient to distinguish create/get/update/deactivate/list failures. | Typed-error unit and integration tests. | MVP | Proposed |
| NFR-OBS-002 | User-visible errors are actionable and do not reveal implementation details. | Presentation acceptance tests and manual review. | MVP | Proposed |
| NFR-OBS-003 | Diagnostic logs are bounded to 20 MB and retained for no more than 14 days by default. | Log rotation test after logging is implemented. | MVP | Proposed |

## 11. Compatibility

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-COMP-001 | MVP release candidates complete smoke tests on every approved OS in the reference environment. | Release checklist evidence for Windows, macOS, and Linux. | MVP | Proposed |
| NFR-COMP-002 | The SQLite schema and persisted values behave consistently across approved OS/CPU combinations. | Cross-platform migration and repository test suite. | MVP | Proposed |
| NFR-COMP-003 | Printer compatibility targets are not approved until the real-hardware technical spike identifies standard/PDF versus 58/80 mm output. | `PRINT-001` spike report. | MVP | Proposed |

## 12. Capacity and scalability

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-CAP-001 | The MVP supports at least 10,000 Products and 50,000 owned Units without violating the performance targets. | Seeded database benchmark. | MVP | Approved |
| NFR-CAP-002 | The MVP supports at least 100,000 Invoices and 1,000,000 InvoiceItems while preserving correct history queries. | Seeded database integration/benchmark suite. | MVP | Proposed |
| NFR-CAP-003 | A database size up to 2 GB remains supported; larger deployments require a new capacity review. | Generated-data soak and integrity test. | MVP | Proposed |

## 13. Accessibility and usability

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-A11Y-001 | Core Product and Invoice workflows are fully operable using only a keyboard. | Keyboard-only acceptance tests for every core flow. | MVP | Proposed |
| NFR-A11Y-002 | Interactive controls expose visible focus and accessible names, and do not create keyboard traps. | Automated accessibility tests plus manual keyboard review. | MVP | Proposed |
| NFR-A11Y-003 | UI color contrast and interaction semantics target WCAG 2.2 AA where applicable to the desktop webview. | Automated contrast checks and manual audit. | MVP | Proposed |

## 14. Maintainability and testability

| ID | Requirement | Verification | Priority | Status |
|---|---|---|---|---|
| NFR-MNT-001 | `typecheck`, `lint`, automated tests, production build, and format check pass before merge. | CI or recorded local commands in the pull request. | MVP | Proposed |
| NFR-MNT-002 | New or changed business rules have direct Domain/Application tests; infrastructure behavior has disposable-database integration tests. | Pull-request test review. | MVP | Proposed |
| NFR-MNT-003 | Proposed line/branch coverage for Domain and Application business logic is at least 80% once a coverage provider is approved. | Coverage report generated in CI. | MVP | Proposed |
| NFR-MNT-004 | New runtime dependencies require documented justification and explicit approval. | Manifest diff and pull-request review. | MVP | Proposed |
| NFR-MNT-005 | Domain/Application retain zero imports from React, Tauri, SQLite, Fuse.js, or browser-specific APIs. | Static import-boundary check. | MVP | Proposed |

## 15. Approval and traceability

Approval must record:

- Reviewer and date.
- Accepted or revised reference environment.
- Accepted, revised, or deferred status for every numeric target.
- Follow-up implementation/benchmark issues for requirements not already
  covered by an existing story.

Approval record:

| Date | Reviewer | Scope | Decision |
|---|---|---|---|
| 2026-09-09 | Project owner | NFR-PERF-002 through NFR-PERF-006, NFR-REL-006, NFR-CAP-001, and §4.1 | Approved as the Product/SQLite baseline; implementation evidence remains required. |

Key traceability:

| Work item | Applicable NFR groups |
|---|---|
| Issue #4 — SQLite foundation/Product repository | REL, MIG, OFF, PERF, SEC, OBS, COMP, CAP, MNT |
| `INV-005` — Product search | PERF, CAP, OFF, MNT |
| Draft auto-save/crash recovery | PERF, REL, REC, OFF |
| Printing spike and adapter | OFF, COMP, A11Y |
