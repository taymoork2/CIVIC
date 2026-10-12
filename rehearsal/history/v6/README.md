# Rehearsal · current handoff v6

Start with [HANDOFF.md](HANDOFF.md), [CHANGES-SINCE-V5.md](CHANGES-SINCE-V5.md) and [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md). Rehearsal is its own product; Laundry is the reference integration. This is a runnable monorepo development snapshot, with standalone extraction unfinished.

## Start on a receiving host

```sh
cd source
pnpm install --frozen-lockfile
pnpm --dir apps/web run review
```

Open http://127.0.0.1:3010/review. No review key, account, model provider or production backend is needed. Dependencies require a registry connection or compatible cache and are excluded. Tested tools: Node 26.10.0, pnpm 12.10.1 and Chrome. Git is optional; missing commit identity is reported rather than fabricated.

The default uses the bundled current Laundry source with six documented compatibility seams applied to this snapshot only. It does not point at the original host. Existing-app onboarding: project picker → Connect existing app → host folder/source folder → Discover screens → confirm screens, props, capture fields and paths → Generate preview → Open project. HTML/native forms and isolated React are supported; provider-dependent states remain gaps. New project creates a runnable note-writing starter. Host switching is shared, not per-person multiplayer.

Try manifest-free discovery by connecting the absolute path to source/apps/web/examples/discovery-app. The authored example can also start directly:

```sh
REHEARSAL_PROJECT=apps/web/examples/rehearsal-demo/rehearsal.project.json pnpm --dir apps/web run review
```

Do not run two servers on 3010. For a disposable host:

```sh
WASHCLOSET_REVIEW=1 VITE_CONVEX_URL=http://127.0.0.1:1 VITE_CONVEX_SITE_URL=http://127.0.0.1:1 pnpm --dir apps/web exec vite --host 127.0.0.1 --port 3146 --strictPort
```

## Contents and integrity

- source/: current Rehearsal, examples, contracts/tests/config/lockfile and released Laundry presenters/dependencies.
- design/: historical local desktop/Claude Design exports, proposals and requested skills. They do not override current product decisions.
- evidence/: labelled onboarding, canvas and reminder captures; provenance and limits are in the verification document.
- context/: source provenance, package-only seams, exact binary source patch/delta against v5 and verification receipts.
- history/v5/: clearly superseded handoff/report/verification.

Excluded: Git internals, dependencies, environment files, review stores, saved personal reviews, local catalogue/settings, Tailscale configuration, harness credentials/destinations and generated user projects. Configure trusted exact agent sessions separately. No production household records are supplied.

Verify with `shasum -a 256 -c SHA256SUMS`. Apply context/since-v5.patch only to a copy of the exact v5 source/; run `git apply --check` first. It includes binary asset changes, not the surrounding handoff/design/evidence. Older packages remain recoverable through the adjacent historical archive/index. [EXTRACTION.md](EXTRACTION.md) maps the remaining standalone work.

