# Finish the active CIVIC shell migration

Controller and sole writer: root, in `/Users/taymoor/Projects/CIVIC`, continuing the uncommitted `feat/shell-theme-settings` work. Existing theme/settings changes are inputs; the unrelated root `package.json` remains untouched. Local implementation and verification are authorized. Publication and replacing an existing user Electron session are outside this task.

## Stages

1. Inventory active shell controls, style imports and extension entry points. Add a source-bound regression check for raw shell controls, obsolete style files and legacy workspace routing; verify it fails against the current source.
2. Add only needed shared shadcn/Base UI primitives. Establish scoped typography and semantic tokens; migrate navigation, responsive rails, breadcrumbs and inspector layout while retaining mounted drafts and native title-bar controls.
3. Migrate remaining shell forms, checkboxes, disclosures, status/canvas controls and project management. Remove superseded styles and the obsolete shell route; keep canvas geometry and domain-specific history/arrow rendering explicit. Preserve reviewed app UI, compatibility data readers, evidence and historical archives.
4. Run type/unit/source checks, integrated package tests, desktop/narrow browser acceptance and isolated installed-Electron acceptance. Inspect desktop/narrow light/dark screenshots in one batch, fix concrete defects, confirm, and record evidence.

## Invariants and stop conditions

- No external app source/backend changes, data cleanup, GitHub CI or publication.
- Preserve preview identity, drafts, failed captures, review inputs, source-bound evidence, checkout tabs and host ownership.
- Shared components own interactive states and typography; layout/geometry styles must not restyle primitive controls.
- Removal means deleting superseded active code, not hiding it behind another cascade or deleting historical evidence. A source guard prevents the active obsolete shell from returning.
- Stop for conflicting writers, unrelated destructive changes or an unreadable authority boundary. Routine implementation choices follow the user's selected shadcn references without another approval cycle.

## Verification record

All four stages are complete. The obsolete route and six stylesheets are deleted, shared components own active shell controls, and the source guard participates in `test:host`. Type checks, package/unit/server tests, repaired browser acceptance and final desktop/narrow Electron acceptance passed within their recorded scope. Two actual-worktree lifecycle tests remain source-gated skips. See `docs/dogfood-reports/2026-10-19-shadcn-shell.md` for checked inputs, screenshots, failures repaired and limits. The working tree remains uncommitted; no existing user Electron session or GitHub state was changed.

## Authorized shipping follow-up

The user subsequently requested updating the installed app, local signoff, commits, merging to main and pushing to GitHub. This supersedes the implementation-stage publication/restart exclusions above. Installed-profile acceptance is recorded in `docs/dogfood-reports/2026-10-19-installed-shell-update.md`; the exact committed candidate must pass `bin/signoff --no-post` before landing. Preserve unrelated primary-checkout files and browser hosts throughout.
