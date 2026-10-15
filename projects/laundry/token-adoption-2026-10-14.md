# Laundry token adoption

Four mappings are implemented and freshly captured at Laundry revision
`e6542c4b3f2ffb46d04c1a871264f9105ef2aa99`, published on
[fix/reference-token-mappings](https://github.com/taymoork2/washcloset/tree/fix/reference-token-mappings).
That revision contains the adapter commit `24784b9a` and current main's review
integration. It is a source branch, not a phone deployment.

| Reference | Application adapter | Existing application meaning |
| --- | --- | --- |
| `--accent` | `--reference-accent: var(--button)` | Interactive accent remains #1f45ff light / #9db4ff dark; focus unchanged |
| `--space-2` | `--reference-space-2: 2px` | `--space-2: 0.5rem` |
| `--space-4` | `--reference-space-4: 4px` | `--space-4: 1rem` |
| `--space-6` | `--reference-space-6: 6px` | `--space-6: 2rem` |

Five `civic adopt` records in `decisions.json` name the full revision, including
the separate dark-accent decision. The fresh importer comparison finds all
four mappings in the app's generated tokens, resolves the primary alias in both
themes, and settles all five historical conflicts. Prior decisions remain in
the decision file; no exception or baseline suppression clears these conflicts.

## Capture

`capture.ts --checkout <clean Laundry checkout> <its isolated review server>`
read 229 scenarios, six browser spec files, actual generated token CSS and the
source facts the graph builder consumes. The review server's revision, captured
index, source snapshot, browser report and all five adoptions agree on the full
revision above. The review host uses synthetic isolated runtimes, with live
Convex URLs disabled; this does not test the owner's live inventory.

The final capture began at `2026-10-15T01:15:21.519Z` (October 14 in Los Angeles):
37 tests passed in 158.3 seconds, with zero failed, flaky or skipped tests.
Two recorded replays at this revision are included.

An initial capture also finished with no unexpected failures, but its first
family runtime test and keyboard feedback test needed retries. The dev server
logged dependency optimization/reloads and an invalid-hook error during its
first load; the feedback test's first attempt missed the captured draft value.
The complete warm-server rerun passed both on their first attempts. No test or
application source was changed to obtain the final report.

## Graph checks

- `node projects/laundry/build.ts`: 347 records, 298 links, 37 tests, two replays,
  zero failing evidence and zero token conflicts.
- All 18 default-theme comparisons and 12 dark-theme comparisons agree.
- `civic check` with `LAUNDRY_CHECKOUT` set passes with zero new findings and no
  stale Laundry evidence. Existing non-token findings remain visible.
- All four CSS-token importer tests pass, including mapped-name comparisons.
- The required full `bin/signoff` runs against the committed CIVIC revision;
  its exact-head result is recorded by that command rather than asserted here.

The reference stylesheets and frozen captures are preserved. No new physical
device or native acceptance is claimed.
