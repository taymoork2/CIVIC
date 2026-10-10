# Planner scripts

Run these from the repository root:

- `node --experimental-strip-types packages/planner/scripts/archive-catalog-evidence.ts` archives manually extracted public research as immutable, content-addressed evidence under `docs/research/evidence/`. It does not fetch sources or confirm care facts.
- `node --experimental-strip-types packages/planner/scripts/chemistry-trial-audit.ts` reports diagnostic chemistry scenarios. Add `--assert` to fail when expectations are unmet; these controls do not confirm owner labels or physical use.

`compile-owner-product-evidence.ts` belongs to the separate owner-evidence compile chain.
