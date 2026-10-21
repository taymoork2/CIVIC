# Private integrations and preview themes

Status: approved and implemented on `fix/generic-host-preview-themes`; release signoff and publication remain separate.

## Outcome

CIVIC starts as a project-agnostic host. Private connected applications remain
available for local validation without their integrations, screenshots, designs,
or reports becoming tracked CIVIC content. Canvas screens can be reviewed in
light, dark, or system appearance, with optional application-defined themes.

## Repository boundary

- Keep the generic engine, manifest contract, Electron lifecycle, and synthetic
  example applications in the repository.
- Preserve private adapters and required validation inputs under ignored local
  storage before removing their tracked originals. Preserve existing project
  connection identities, saved reviews, drafts, and recordings.
- Load optional local integrations explicitly through configuration. Generic
  startup must not import a named private application, require its checkout or
  dependencies, or fall back to a developer-specific source path.
- Remove private project references and assets from tracked source, examples,
  fixtures, docs, plans, reports, and build/signoff inputs. Replace necessary
  contract tests with small synthetic fixtures. Do not merely rename private
  screenshots or project source and retain them as public fixtures.
- Check textual contents and filenames, plus tracked image/archive inventories.
  Leave unrelated untracked files and connected application checkouts untouched.
- This scope cleans the current tracked tree. Published Git history, forks,
  clones, release artifacts, and caches are not erased by deleting files.
  History rewriting requires separate scope and explicit authorization.

## Preview theme controls

- Place compact appearance and optional application-theme controls beside the
  device/resolution picker in the canvas toolbar, using shared shadcn controls.
  Offer Appearance: System, Light, Dark. Do not add another settings modal.
- Preview appearance is independent of CIVIC shell appearance. System follows
  the operating-system preference and updates open previews when it changes.
- Resolve system to light or dark for each capture and recording. Keep requested
  preference and resolved appearance distinct so saved evidence is reproducible.
- Allow projects to declare a bounded list of named application themes and a
  default. Expose App theme only for projects declaring that capability.
- Let the project's preview adapter apply its own internal theme through a
  supported hook. Do not infer themes by crawling source, overwrite arbitrary
  storage, invert screenshots, or inject guessed application styles.
- Keep existing adapters and recordings valid without the new declaration.
  Unsupported appearance overrides must be reported honestly.
- Include resolved appearance and application theme in capture identity,
  recordings, review context, and reproduction links. Never reuse a screenshot
  from another theme as current evidence.
- Update live previews in place without losing inputs, runtime identity, scroll,
  or unsaved review comments. Failed updates retain the previous usable state.
- Reuse the capture queue/cache. Refresh visible screens on demand; changing
  theme must not eagerly capture every screen or build other projects.

## Acceptance

- Start browser and Electron with only a synthetic manifest and no private
  integration installed. Validate optional local connections separately.
- Check light/dark/system, system preference changes, and two declared app
  themes at desktop and narrow widths. Confirm shell independence, input/run
  preservation, cache separation, and saved evidence/replay correctness.
- Verify old manifests/recordings, invalid theme declarations, failed hooks, and
  projects with no internal themes. Release listeners and capture resources.
- Run focused checks for changed seams. Existing release-signoff failures stay
  visible; no push or broad signoff is implied by this implementation request.
