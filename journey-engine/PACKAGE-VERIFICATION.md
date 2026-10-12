# Verification, 2026-10-11

## Workspace proof

Rehearsal source: f0d3, detached 0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d plus dirty/untracked work. Linked Laundry source was read-only; package captures c325b5ef848b90fa8a68ea1beec5602f3b7a11f8 plus working-tree hashes. Source/provenance and binary delta describe exported inputs; neither HEAD alone proves the snapshot.

- `pnpm --dir apps/web test`: 98 Vitest files / 810 tests plus 13 Node catalogue/account checks passed. This is the working Rehearsal checkout's web suite, not the entire linked app/backend/native suite.
- `pnpm --dir apps/web run test:review`: 36 server/integration checks passed, including actual isolated effects, identity/condition boundaries, source refusal, overlays, onboarding, command validation, caches and review persistence.
- TypeScript and style checks passed: 1591 static utilities compile in the working checkout. Tracked `git diff --check` passed.
- Five towel browser cases cover both branches through native save and fresh replay, proposal copy/color persistence, failed-save recovery, and real Fabric/Bleach/Saved PNG snapshots.
- Four canvas and three linked-source cases passed: draft retained across navigation/review/proposals, recording attached to the live towel review, bounded overview/branches, route evidence, all-screen layout with lazy images, stale thumbnail failover, linked proposal edits and care substeps.
- Eight existing Home/Drying browser cases passed after sharing the Laundry session: real Wear, portalled editing, empty/partial put-away, returned route, captured quantities, error receipts, fresh replay and privacy/ambiguity refusal.

Initial browser failures exposed obsolete test expectations (old arrow accessibility labels, fixed eager image count, and blocked isolated POSTs). Tests were updated to assert current behavior. A real snapshot failure was fixed: a portal can leave the React root hidden/inert while ready; capture now waits for the attached ready marker. The new snapshot case was observed failing before the fix and passing afterward.

## Receiving-host copy

An independent copy under /private/tmp/rehearsal-v7-portable-t_fb7kv1/source was installed with `pnpm install --frozen-lockfile --offline`: 310 packages reused, zero downloads. It uses exported/bundled app source, no f7ce binding, no original review store and no live Laundry backend.

- Portable TypeScript/style checks passed (1661 compiled utilities in the newer bundled app snapshot).
- Portable `test:review` passed all 36 checks.
- All five portable towel browser cases passed, including actual effects, fresh saved proposal replay, recovery and real snapshots.

This verifies an unchanged lockfile against an existing compatible cache, not an online clean-machine install. Dependencies and Chrome are not in the ZIP. Temporary dependency symlinks/live stores stay outside the archive.

## Running preview and integrity

Only Rehearsal's 3010 process was restarted. Loopback and the existing private Tailscale /review and inventory returned 200 with the same source and towel-runtime adapter. A primary-preview proposal/fresh-replay smoke check was run. Laundry's frontend/backends and canonical design were not restarted or edited.

context/since-v6.patch has 21 added, 39 modified and zero deleted source files. `git apply --check` passed on exact v6 source; applying it reproduced every final source file hash. context/patch-verification.json retains the patch digest and counts. MANIFEST.json, SHA256SUMS and the external ZIP verification sidecar bind payload hashes, safe paths, CRC and excluded private/runtime paths. Source provenance distinguishes original inputs, package-only seams and portable receiving guides.

## Limits

This is local Chromium, source/API and portable development-host proof. No physical-phone, native platform, production auth/OCC/optimistic backend, external/server-action, multiplayer or fresh design acceptance is claimed. Native/bundler integration direction is researched only. Remaining curated fixtures still use legacy adapters. Historical design/images are context, not current acceptance. Existing saved recordings are refused on changed source and are not silently migrated.
