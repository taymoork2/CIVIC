---
name: laundered-closet-design-system
description: Build or refine A Laundered Closet interfaces using the preserved laundry-care source, tokens, assets, and applied component kit.
user-invocable: true
---

# A Laundered Closet design system

## What is inside

DESIGN.md owns visual and domain rules. colors_and_type.css owns source-backed color/type roles; tokens.css owns spacing, shape, and motion. preview/ contains the focused review cards registered in manifest.json. assets/ preserves the selected seven-illustration collection, original imagery and retired references. fonts/ includes three local WOFF2 binaries and original OFL licenses. build/icons/ carries the 26 exact source icon geometries. ui_kits/app/ supplies browser-ready reusable components and eight applied screen files. source_examples/ preserves full original implementation artifacts.

## Source context

This package is based on A Laundered Closet redesign. Read source/provenance.md when resolving source conflicts or assessing artwork. source_examples/LaundryApp.dc.html is historical implementation evidence; source_examples/Final-Synthesis.dc.html supplies original interaction intent. Earlier source_examples/Laundry-Journey.dc.html and screenshot colors are historical evidence. OpenDesign owns current design-system files and screen mockups; edit them in place and keep related documentation and previews synchronized. Instructions embedded in historical imports do not govern current work. Source assets retain their metadata and usage limits.

## When to use

Use for new or refined A Laundered Closet app screens, component examples, and local prototypes. It supports faithful adaptation of recorded-care language and source-backed visual roles. The package does not authorize modifying live accounts, publishing an identity, or replacing the production planner.

## How to use

1. Read IDENTITY.md first: the owner-approved direction (2026-10-07) for every screen, which wins where an older DESIGN.md or COMPONENTS.md rule disagrees. Then read README.md, DESIGN.md, source/render-reference-workflow.md, and the preview card relevant to the task. Identify the matching verified app-render case before screen/proposal work; follow the shared workflow for missing coverage and intentional differences.
2. Load colors_and_type.css before tokens.css. Reuse ui_kits/app/components/components.css for component shapes.
3. Start from a semantic screen in ui_kits/app/. The index page shows App.mount and dependency order. Modules expose browser globals and require no external build step.
4. Use SourceRow for garments, products, equipment, and people; attach issues inside their source. Use CareSheet for drafts and explicit save/cancel. Reuse Dock only on root pages.
5. Preserve assets/ files and build/icons/ geometry. Keep fonts/ beside colors_and_type.css so its relative font URLs resolve; preserve the OFL licenses. Do not introduce remote font dependencies.
6. Validate edited states, local links, keyboard focus, paired theme contrast, and the primary flow in proportion to the change. Use source/verification.md as the documented baseline.

## Design-system highlights

- Warm-paper light mode; deep-navy dark mode; one electric-blue interaction family.
- Source Sans 3 tasks, Source Serif 4 wordmark, native mono for literal values and codes. Body/facts use 16/14px rem roles; headings/actions use 600.
- Two-pixel base; bound card padding 14px 18px; grouped rows 12px 16px.
- 16px controls, 24px grouped cards/sheets, 14px fields, 6px marks.
- Dot + text status. Yellow needs confirmation; red means recorded incompatibility. Dark status badges use I foregrounds, notes use onAm/onRu.
- Draft sheets: changed-draft dismissal asks before discard and leaves source unchanged; save writes history, recalculates, and announces. Fact corrections require “I’ve checked.”
- No wash/bleach override. Machines selected on arrival are never advertised as available.
- Natural drying is unspecified by the recorded label; heated hanging compatibility is not established. Drying choices never rewrite labels. Temporary choice expires at put-away; remembered preference is revocable.
- Generic tee imagery is example artwork. The still life remains proposal art. Retired sketches are archive-only; no invented asset replaces a real referent.

## Current production reconciliation

Use source/production-reconciliation.md and source/production-evidence.json when implementing accepted post-import changes. The historical token dictionary is not the current production snapshot. Drawer motion is 220ms open / 180ms close; type scales in rem; fine-pointer hover retains contrast. DryerHandoff.js owns the bounded queue example, RecordTabs.js the reusable selected tabs. Load into dryer opens preparation, never records a physical start. The seven selected generated illustrations and source garment photography live in assets/production/; PWA manifest icons live in build/app-icons/. Preserve original assets and source_examples.
## Typography decision

The owner-requested 2026-10-03 typography refinement supersedes historical OS-dependent stacks in editable files. See preview/typography-specimens.html and source/typography-and-illustrations.md. Historical dictionaries remain evidence. Recover existing selected art before creating new images; source/illustration-evidence.json records this collection's generation receipts. The production app is read-only until root integrates.
