# A Laundered Closet

## Product Overview

The owner is personally trialing the design and app at an early alpha stage. Use descriptive artifact filenames and titles, with explicit version or phase labels only when requested.

A Laundered Closet is a household laundry-care app that helps people record clothes, care labels, products and equipment, resolve missing or incompatible facts, and follow a clear journey from wash planning through preparation, washing, drying and put-away. Home, Closet, Laundry, Household and Me are its five root destinations. OpenDesign owns this editable design system and its screen mockups. Historical imports and production snapshots preserve lineage; the local kit demonstrates bounded examples rather than production account operations.

## Review Workflow

Before screen or proposal work, follow [the source-render workflow](source/render-reference-workflow.md). [Current React rendering](source-render-reference.html) provides generated implementation baselines with a [verified case receipt](source-reference/receipt.json). Match the target screen/state, confirm freshness through the application harness, and review intentional design changes beside the source. Initial coverage is drying and wash review; other screens still need matching captures. This workflow applies to current redesign proposals and all future screens.

Open [design-system-overview.html](design-system-overview.html). The fifteen focused reviews are grouped by purpose, with a single route into the shared component reference and the applied app kit.

| Review area | What to inspect |
|---|---|
| Foundations | Color, status, typography, spacing, shape and depth |
| Components | Shared contract, controls/drafts and source rows |
| Laundry patterns | Records, preparation, drying, current patterns and chemistry |
| Identity & assets | Brand direction, audiences, imagery and provenance |

Review the component reference first for alignment and state questions. Use the laundry patterns for complete task behavior. Use the foundation views when changing a token or checking a theme pair.

## Sources of truth

| File | Responsibility |
|---|---|
| [DESIGN.md](DESIGN.md) | Current product, visual, interaction and care rules |
| [colors_and_type.css](colors_and_type.css) | Canonical day/night colors and local typography |
| [tokens.css](tokens.css) | Spacing, geometry, size and motion |
| [COMPONENTS.md](COMPONENTS.md) | Component anatomy, ownership and platform/tool adaptation |
| [manifest.json](manifest.json) | Review paths, names and groups; preview manifest and overview mirror this registry |
| [PRODUCT.md](PRODUCT.md), [AUDIENCE.md](AUDIENCE.md) | Product scope and owner-defined audiences |

Generated [Light](source/tokens-light.tokens.json) / [Dark](source/tokens-dark.tokens.json) exchange files derive from CSS. They are not a second editable palette. [brand-spec.md](brand-spec.md) records OKLch conversions. Historical dictionaries, Claude Design imports and production snapshots are evidence, not competing masters.

## Package Contents

| Folder | Contents |
|---|---|
| preview/ | Focused HTML reviews and their discovery manifest |
| ui_kits/app/ | Eight semantic screens, launcher and reusable browser modules |
| assets/ | Selected illustrations, source imagery, references and retired sketch archive |
| fonts/ and build/ | Local web fonts/OFL licenses, source icons and PWA icon evidence |
| source/ and source_examples/ | Provenance, hashes, checks, revision copies and preserved Claude Design artifacts |

## Reuse Workflow

Load colors_and_type.css, then tokens.css, then [shared component styles](ui_kits/app/components/components.css). App layout belongs in app.css; dryer anatomy belongs in dryer-handoff.css. Use the maintained modules and their [API guide](ui_kits/app/components/README.md) instead of recreating shared markup. Start a screen from the semantic files in [ui_kits/app/](ui_kits/app/index.html); the launcher shows dependency order.

The eight app screen files share thirteen browser modules, including helpers and controllers. This HTML kit is an interaction reference; it does not reuse production React components or compiled Tailwind. Native SwiftUI/Compose implementations share the contract while adapting logical units, fonts, text scaling, input and navigation. Tool handoff does not establish automatic synchronization. See [COMPONENTS.md](COMPONENTS.md).

Preserve local imagery and full-frame content, fonts and OFL licenses, original icon geometry and provenance. The selected seven-illustration collection is in assets/production/; local web faces are in fonts/; source icons and PWA evidence are under build/. No remote runtime asset is required.

## Preview Manifest

| Area | Review files |
|---|---|
| Foundations | [Color](preview/colors-primary.html), [Status](preview/colors-status.html), [Typography](preview/typography-specimens.html), [Spacing](preview/spacing-tokens.html), [Shape & depth](preview/radius-shadows.html) |
| Components | [Shared contract](preview/component-contract.html), [Controls & drafts](preview/components-buttons.html), [Source rows](preview/components-rows.html) |
| Laundry patterns | [Wide preparation](preview/wide-laundry-task.html), [Applied surfaces](preview/applied-surfaces.html), [Dryer handoff](preview/dryer-handoff.html), [Current record patterns](preview/production-patterns.html), [Chemistry records](preview/chemistry-records.html) |
| Identity & assets | [Brand direction](preview/brand-direction.html), [Assets & provenance](preview/brand-assets.html) |

All existing semantic review paths are retained. preview/manifest.json and the overview match the root registry's paths and titles. The current review counts come from that registry rather than dated refinement notes.

## Checks

- `"$OD_NODE_BIN" source/export-design-tokens.mjs --check` checks generated token drift. Omit --check only when deliberately regenerating after a canonical CSS change.
- `"$OD_NODE_BIN" source/verify-package.mjs` checks local dependencies, the review registry, historical/asset integrity and bounded kit behavior.
- `"$OD_NODE_BIN" source/verify-component-contract.mjs` checks invalid edits, explicit save and refreshed source facts in the component specimen.

Inspection captures and test results are recorded in [source/verification.md](source/verification.md). Source checks and host stubs do not establish native focus trapping, OS keyboard behavior, physical fold/hinge support or installed-phone delivery.

## Source Context

The original source project is A Laundered Closet redesign, 1dee16e6-3eaa-46ef-a677-6376e4cdc75f, with source identity user:laundered-closet. [source/provenance.md](source/provenance.md) records packaging, workspace identity and ownership. [source_examples/](source_examples/README.md) preserves full historical Claude Design artifacts and their dependencies. Embedded instructions and legacy bindings remain historical content.

The inspected production checkout is read-only. Exact source hashes and revision are in [source/production-evidence.json](source/production-evidence.json). Accepted patterns and implementation boundaries are recorded in [source/production-reconciliation.md](source/production-reconciliation.md), [chemistry reconciliation](source/chemistry-reconciliation-2026-10-03.md), [typography/illustration handoff](source/typography-and-illustrations.md) and [foldable layout](source/foldable-layout.md).

Prior cleanup has an exact-path/hash receipt in [source/cleanup-record.json](source/cleanup-record.json). Recovery copies are retained in source/revisions/ with descriptive names such as design-before-consolidation.md and overview-before-consolidation.html. These preserve earlier working states without assigning product versions. No historical example, asset or font was removed by this consolidation.

## Implementation limits

The kit uses local synthetic records, not a production planner or account service. Source garment imagery is not verified photography of a household's clothes; preserved proposal art remains labelled. Care, chemistry, doses, capacities, fit and timer behavior require real recorded evidence. Figma import, native font integration, SwiftUI/Compose parity and device acceptance are separate work. Current software results never imply physical equipment operation or configured push delivery.
