# Issue #14 — Invoice Domain/Application TDD Evidence

## Scope

- Invoice and InvoiceItem domain invariants for UC-01.
- Atomic persistence contracts for draft creation, semantic draft edits,
  completion, and confirmed completed-invoice overwrite.
- Application use cases and typed errors; no SQLite or Presentation work.

## RED

1. Domain tests failed because `Invoice` and `InvoiceItem` did not exist.
2. Application tests failed because the invoice use cases and repository
   abstraction did not exist.
3. The first Application implementation exposed a failing assertion where a
   missing line item was incorrectly mapped to a generic validation error.

## GREEN

- Domain suite: 26 tests passed after implementing the aggregate and item.
- Full suite: 107 tests across 9 files passed.
- `npm run typecheck`, `npm run lint`, `npm run build`, and
  `npm run format:check` passed.

## Coverage note

The repository does not include a Vitest coverage provider or a coverage
script. `npm ls @vitest/coverage-v8 --depth=0` returned empty, so no coverage
percentage is claimed and no unapproved dependency was added. The new tests
exercise the issue's required happy paths, state-transition failures,
snapshot validation, overflow rejection, typed errors, and persistence
operation boundaries.
