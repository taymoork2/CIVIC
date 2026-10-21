# 0010: Projects depend on CIVIC; CIVIC stays independent of connected projects

Status: accepted. Original decision: 2026-10-13; boundary clarified 2026-10-20.

## Decision

CIVIC owns the generic canvas, review shell, Vite connector, manifest contract,
recording and evidence system. A reviewed project owns its adapter, scenario
registry, synthetic seed, runtime entry, and optional canvas extension.

A project installs CIVIC's packages at an explicit version. CIVIC neither vendors
private application source nor requires a named application's checkout,
dependencies, assets, or backend to start or pass its public checks.

Optional local integrations are loaded explicitly from ignored configuration.
Their source, captured images, design references, and validation reports stay
outside tracked CIVIC content. Connecting a project does not authorize changing
its source or accessing production data. Synthetic previews use disposable
runtime state and preserve recorded content identities.

## Verification

Public checks use the synthetic Notebook, Tasks, Team board, Reading list, and
Pantry applications, public component demos, and small purpose-built graph and
importer fixtures. Real-project validation is optional and local.

Deleting private content from the current tree does not erase published Git
history. Rewriting shared history requires separate authorization.
