# Issue #5 Product domain — TDD evidence

## Source and journey

Behavior is derived from GitHub issue #5, `docs/architecture.md` §19, and
`docs/use-cases/UC-02-product-management.md`.

As the catalog owner, I can create, update, deactivate, and reload a Product
with valid owned Units while invalid aggregate states are rejected before
persistence.

## RED and GREEN evidence

| Guarantee | Test target | Evidence |
|---|---|---|
| Missing Product behavior is exercised by the specification | `src/domain/entities/Product.test.ts` | RED: 17 tests discovered; 6 success-path tests failed because `Product.create`/`rehydrate` did not exist |
| Unit identities cannot be reused inside one Product | `rejects duplicate Unit identities` | RED: 1 of 18 tests failed because duplicate IDs were initially accepted |
| Product normalization, validation, update, deactivation, and rehydration work together | `src/domain/entities/Product.test.ts` | GREEN: all 18 Product tests passed |
| Existing behavior has no regression | full Vitest suite | GREEN: 3 test files, 38 tests passed |
| Catalog use cases depend only on the repository port | `ProductCatalogUseCases.test.ts` | RED: test module could not resolve the five missing use cases |
| Invalid runtime Unit input never leaks `TypeError` | Unit/Create/Update regression tests | RED: 4 tests failed with silent null fallback or raw `TypeError`; GREEN after boundary validation |
| Create/Get/Update/Deactivate/List return typed outcomes | `ProductCatalogUseCases.test.ts` | GREEN: success, validation, not-found, SKU conflict, persistence, visibility, reconciliation, and idempotency paths pass |

## Final verification

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm run test` — passed (4 test files, 64 tests)
- `npm run build` — passed
- `npm run format:check` — passed
- `git diff --check` — passed

## Coverage and known gaps

The repository has no coverage script or Vitest coverage provider configured,
so a numeric coverage percentage was not measured. No dependency was added
because issue #5 does not approve one. SQLite implementation and integration
tests remain scoped to issue #4.
