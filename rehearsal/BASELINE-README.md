# Rehearsal — new project handoff

Rehearsal is a working product exploration and review workspace: an application journey on a canvas, with real screens you can play, proposed changes you can test, and feedback attached to captured state. Laundry App is its first integration.

This is the October 10, 2026 working-source handoff. It includes uncommitted implementation, design proposals, local desktop design artifacts, current browser evidence and a path to extracting an independent product. **The product shell is independent; the implementation still imports Laundry App components.** The original repository and running server were not changed by packaging.

Start with [HANDOFF.md](HANDOFF.md). The recipient needs Git, Node.js 26.10.0, pnpm 12.5.1 and Google Chrome. No OpenDesign Cloud account or running Convex backend is needed for synthetic review. Installing dependencies needs access to the package registry or a populated local pnpm store.

## Run locally

From the extracted folder, create your own source repository. The inventory requires a Git HEAD; this import commit provides one. No upstream remote is configured or original Git history included.

```sh
cd source
git init -b main
git add .
git -c user.name="Rehearsal import" -c user.email="import@localhost" commit -m "chore: import rehearsal handoff"
pnpm install --frozen-lockfile
```

The bundled thumbnails contain only fixed synthetic fixtures. Copy them once to avoid regenerating the entire screen library on first launch:

```sh
mkdir -p .review-data/fixtures
cp ../fixtures/*.png .review-data/fixtures/
WASHCLOSET_REVIEW_DESIGN="$PWD/../design/laundry-reference" pnpm --dir apps/web run review
```

Open <http://127.0.0.1:3010/review>. In another terminal, from `source`, read `.review-data/access-key` and enter that new local key at the sign-in screen. Keep the host and port consistent. If 3010 is already occupied, use this equivalent startup on another loopback port:

```sh
WASHCLOSET_REVIEW=1 WASHCLOSET_REVIEW_DESIGN="$PWD/../design/laundry-reference" VITE_CONVEX_URL=http://127.0.0.1:1 VITE_CONVEX_SITE_URL=http://127.0.0.1:1 pnpm --dir apps/web exec vite dev --host 127.0.0.1 --port 3011 --strictPort
```

Open `/review?scenario=intake.towel.fabric` to inspect Fabric directly. This is a fixture jump, not a replay of preceding steps. Start from Type to play the complete towel journey. Newly owned enters Dye; pre-owned skips it. Normal transitions preserve one application session and capture allowlisted raw inputs.

The new store starts without the original notes, proposals or browser draft. Create your own candidate in **Edit proposal**, then **Save & play candidate**. Supported edits are heading, primary-action text and accessible button color. Review can capture a screen, retain the capture while navigating, save a note and resolve it with evidence.

## Check the implementation

From `source`:

```sh
pnpm --dir apps/web run check
pnpm --dir apps/web exec vitest run src/review src/closet/add-clothes.test.tsx
pnpm --dir apps/web run test:review
```

The explicit browser test mutates only the local synthetic review store. Run it against the review server you started, with loopback listeners and Chrome available:

```sh
WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 pnpm --dir apps/web exec playwright test e2e/review-canvas.spec.ts --project=isolated --workers=1
```

That new browser scenario was saved but not executed in the original delivery. See [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) for checks actually performed on this package.

## What is included

| Folder/file | Purpose |
|---|---|
| `source/` | Current working source, lockfile, tests, Laundry adapter dependencies and relevant repository documentation |
| `HANDOFF.md` | Product decisions, architecture, design workflow, current limits and recommended next work |
| `AGENTS.md` and `source/AGENTS.md` | Portable instructions for the incoming contributor |
| `context/` | Original local instructions as historical context; source provenance |
| `design/local-open-design/` | Actual local desktop prototype and completed written briefs/handoff |
| `design/laundry-reference/` | Bounded canonical references for the reviewed Laundry screens, not authority for Rehearsal's shell |
| `design/proposal-images/` | Owner-supplied/generated design concepts, including Claude Design's three structures |
| `design/skills/` | Portable copies of the owner's named design guidance; these are reference snapshots, not installed tools |
| `evidence/` | Actual implementation screenshots, with historical and current passes distinguished |
| `fixtures/` | Revision-keyed synthetic screen thumbnails for the initial screen library |
| `MANIFEST.json`, `SHA256SUMS` | Per-file integrity and packaging provenance |

Verify the extracted payload with `shasum -a 256 -c SHA256SUMS` from this folder. `SHA256SUMS` covers the payload and manifest; it excludes itself.

Excluded: credentials, environment files, existing review records/session data, Git internals/history, dependencies, build outputs, personal harness configuration and unrelated Laundry audit archives. Full private collaborator chat exports are not included; their decisions, identifiers, written handoffs and supplied artifacts are included. Historical documents retain their original paths and receipts and must not be treated as fresh proof for the imported project.
