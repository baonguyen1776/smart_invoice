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

## Final verification

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm run test` — passed (38 tests)
- `npm run build` — passed
- `npm run format:check` — passed
- `git diff --check` — passed

## Coverage and known gaps

The repository has no coverage script or Vitest coverage provider configured,
so a numeric coverage percentage was not measured. No dependency was added
because issue #5 does not approve one. Application use cases and repository
contracts remain separate follow-up work within issue #5.
