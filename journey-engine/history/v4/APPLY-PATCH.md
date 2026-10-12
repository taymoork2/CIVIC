# Apply the cumulative v4 source changes

Use `context/rehearsal-since-first-zip-v4.patch` against `source/` extracted from the exact original `rehearsal-handoff-2026-10-10.zip`. Baseline SHA-256: `fb1738009443993ef0dc9d7b059973747d8f9556fe54c6e9d46e997c89fca5ad`.

This cumulative Git-format patch covers 27 source paths: 11 additions, 16 modifications, no removals. It includes coverage, canvas corrections, cross-route bindings, arrow routing, full-detail controls, tests and updated docs. It is not a patch from v3; do not apply it on top of an already updated bundle.

From the original extracted `source/`, substitute the real path to this new bundle:

```sh
git apply --check /path/to/rehearsal-handoff-2026-10-10-v4/context/rehearsal-since-first-zip-v4.patch
git apply /path/to/rehearsal-handoff-2026-10-10-v4/context/rehearsal-since-first-zip-v4.patch
```

The check and application passed on a fresh baseline extraction. Every resulting changed-path hash matches the current checkout. See `context/rehearsal-since-first-zip-v4-PATCH-VERIFICATION.json` and `context/rehearsal-post-zip-delta-v4.json`.

No original repository history, commit or staging operation is needed. If the check fails because the recipient has additional changes, retain them and reconcile the hunks. This patch is not assumed to apply to Laundry main or an arbitrary checkout. Use the full ZIP for refreshed fixtures, design/evidence context and handoff wrappers; these are outside the source patch. Private state is absent from both.
