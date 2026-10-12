# Independent review-product design pass

Status: exploration. No replacement visual direction has been selected and no application UI has changed in this pass.

Latest owner feedback requests actual screens as journey nodes, in-place interaction, Edit / Play, captured inputs and a decision about developer controls. See [the screen-canvas revision](screen-canvas.md) for the latest visual, completed collaborator critique and boundaries. It supersedes the separate Map / Try it navigation. The prior [combined journey and collaboration proposal](journeys-and-collaboration.md) preserves branching, proposal/alignment and multiplayer contracts and the owner's preference for original concepts 1 and 2.

The owner approved targeting the next brief at the existing local project. Codex sent it through the desktop app to Rehearsal Review Workbench, project `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, where `FOLLOWUP-BRIEF.md` was saved and inspected. It carries Claude Design's completed handoff, both cross-critiques, grounding corrections and interaction invariants. SHA-256 comparisons confirmed `index.html`, `app.html` and `HANDOFF.md` were unchanged. This approval covers brief routing/preparation; visual selection remains open.

## Current-screen observations

Captured from the running review workspace on October 9, 2026, using the in-app browser. Screenshots are held in the current chat's `review-workspace` visualization folder.

| Step | Observed state | Health and design implication |
| --- | --- | --- |
| 1 | Current narrow browser, 488px wide | The first screen shows large setup controls and scenario navigation; the working preview is below the fold. Open directly on the preview and move other tasks into deliberate modes or sheets. |
| 2 | Desktop, 1440 × 1024 | The preview is visible but the tall setup row and long equally weighted scenario list dominate the shell. Group journey/step navigation, make context compact, and keep feedback alongside the reviewed state. |
| 3 | Direct towel Fabric preview, 393 × 852 | The actual task drawer is visible. Keep the real application in the preview; illustrative reconstructions in design artifacts must be labelled and must not count as application proof. |

These are screen-level observations, not a complete journey audit, accessibility certification, or behavioral test. Existing draft, save, capture and resolution behavior remains a design constraint.

## Proposed responsibility split

| Area | Owner |
| --- | --- |
| Product brief, integration and acceptance evidence | Codex with the product owner |
| Independent design proposals and interaction critique | Claude Design and local Open Design desktop app |
| Review shell, scenario navigation, feedback and evidence presentation | Independent review product |
| Real components, scenario seeds and application-specific effects | Laundry App integration |

## Handoff requirements

Compare the desktop primary screen and narrow-screen companion, feedback composition and saved-note states, and evidence visibility. Preserve explicit draft-discard confirmation, pending/error/retry behavior and durable feedback. Carry visible design status separately from implementation/check/device status. Record each collaborator's actual artifact and reviewed revision before selecting a direction.

Use the linked Figma design-basics reference for hierarchy, grouping, alignment and typography, alongside the requested Apple, Emil, Impeccable, Product Design and frontend craft guidance. Apply utility-product constraints when a named skill otherwise assumes a marketing page.

## Direction exploration

The product's mechanism is a captured product state that can be revisited and evaluated alongside the feedback it caused. Its scene is a person reviewing a working app while an agent reproduces and fixes the same state. The ordinary developer dashboard and its predictable decorative opposite both under-serve that mechanism.

Seven grounded directions considered, in resonance order:

1. Digital review workbench: preview at the center, grouped journey rail, contextual inspector.
2. Film contact sheet: sequence of readable state thumbnails with one large selected frame.
3. Rehearsal script: a step sequence with precise marks that persist when replayed.
4. Software diff viewer: original capture and current state aligned for checking a resolved note.
5. Field notebook: a captured state and its observation share a page; browsing and annotating are explicit modes.
6. Editorial markup desk: one working surface with contextual annotation tools and a margin for comments.
7. Conservation case file: each state keeps its source, condition and repair evidence together.

Impeccable's reproducible direction seed `58489119` assigned the field-notebook direction. The network-enabled roll succeeded against catalog `c3b204a1eed6`. This is an exploration assignment, not a user selection or permission to implement.

| Catalog challenger | Audience identification | Product clarity | Verdict and retained discipline |
| --- | --- | --- | --- |
| Japanese high-density web | Too much tiny, boxed information for this owner review task | Competes with the preview | Declined. Keep its discipline of compact secondary controls without shrinking text. |
| Registered botanical stage folio | Recognizable comparison ritual, with a foreign subject | Fixed-scale states improve comparison | Competitive as a sequence direction. Keep registered framing and descriptive change summaries; no botanical decoration. |
| Boarding pass and gate board | Change-tracking is recognizable, travel-specific vocabulary is not | A persistent changed state is useful, departure ranking is not | Declined. Keep changed-state identity and priority-based responsive columns. |
| Convention circle catalog | An inventory-scanning ritual is recognizable | Tiny tiles make exact feedback harder | Declined. Keep grouped discovery and deep links; never a stamp-sized working preview. |
| Midnight transit diagram | Journey and branch navigation is recognizable | A selected corridor can clarify steps | Competitive as a journey direction. Show only the selected sequence and transfer context on mobile. |
| Data-sublime barcode field | An art installation is remote from everyday product review | Strobing and numerical density obscure the task | Declined. Keep a disciplined high-contrast focus state without strobing or barcode ornament. |

The assigned direction is raised by compact controls (high-density web), persistent change identity (gate board), grouped discovery (catalog), and contrast discipline (data field). These are system disciplines, not copied visual motifs. The preview-first workbench remains the practical alternative; its familiarity is an explicit tradeoff. Final proposals must incorporate the collaborators' completed handoffs before presentation.

## Completed collaboration

Claude Design completed the private Sightline canvas with nine artboards: three desktop states, four narrow states, structural alternatives, and tokens/responsive rules. Codex inspected its rendered desktop workbench. Claude Design's own handoff says it did not render or test the proposal. Accept/restore actions on the narrow boards are incomplete; the intermediate two-pane layout has no artboard.

The local Open Design project completed `index.html`, `app.html`, and `HANDOFF.md`. Codex read the handoff and captured the rendered prototype at 1440 × 1024 and 390 × 844. The mobile screen opens on the preview; the desktop inspector clips some long content. Resizing without reloading briefly produced an incorrectly scaled layout. These observations are not functional or accessibility acceptance.

Each collaborator then received the other's actual recommendations and returned a text-only critique. Neither changed its artifact during the cross-review.

| Decision | Claude Design critique | Local Open Design critique | Codex integration position |
| --- | --- | --- | --- |
| Primary structure | Preview-first workbench | Use Sightline as the base | Strongest practical proposal; remains subject to the owner's visual choice. |
| Context | Short Who/Conditions/Display groups on desktop; single summary and sheet on narrow screens | Prefers Sightline's summary over its own four chips | Keep separate persona/access fields. Presentation changes can be non-destructive only when they actually retain the app draft; the current frame reload behavior must be addressed before removing its guard. |
| Partial specimens | Collapse at scenario level; search/deep links still reveal them | Collapse by default | Coverage gaps remain visible without dominating navigation. Use real registry groups/counts. |
| Mark and reproduce | Returning corner ticks; explicitly report a missing/moved element | Adopt marks and reproduction from Rehearsal | Resolve stable anchors at the current revision; show unresolved anchors rather than drawing an inaccurate live mark. |
| Evidence | Four independent statuses default to unknown/not run | Withdraws browser pass as an absolute device-acceptance gate | No status implies another, and no invented pass numbers enter the implementation. |
| Preview | Retain actual app iframe | Reject its reconstructed screens | Keep the existing real component/fixture/capture path. Design reconstructions are illustrative. |

Both collaborators acknowledged incorrect mock journey names, guessed grouping, invented revisions and care instructions. The integration must use the real intake order: type, whose, details, fabric, color, origin, dye, care, stain, final. The towel Fabric fixture is cotton 80% / polyester 20%. Neither artifact proves a browser pass, device acceptance, contrast measurement or a safe washing/drying setting.

The current repository already supplies review fixture isolation, frame communication, capture and durable feedback. Inspect and reuse those seams during implementation; the collaborators' generic iframe warnings are design risks, not proof those mechanisms are missing here.

## Presented visual options

Three independent Image Gen results were displayed in this chat in the following order. The visible result order is the selection identity; no direction is approved yet. Each presents the desktop primary view and a narrow companion of the same concept.

| Visible number | Direction | Generated image |
| --- | --- | --- |
| 1 | Focus Workbench | `/Users/taymoor/.codex/generated_images/01a12354-2b94-7df3-aff2-45fe8e90641e/exec-4c5fe450-7247-42dc-9479-3908fbea1232.png` |
| 2 | Observation Folio | `/Users/taymoor/.codex/generated_images/01a12354-2b94-7df3-aff2-45fe8e90641e/exec-71166539-f3ec-425f-b45d-405c4ebc35d5.png` |
| 3 | Journey Studio | `/Users/taymoor/.codex/generated_images/01a12354-2b94-7df3-aff2-45fe8e90641e/exec-c7d6c199-6a4d-44af-977b-31b3b3dcd8f0.png` |

All three calls attached the inspected real Fabric screenshot and the rendered local Open Design desktop/mobile proposal captures. Claude Design's contribution was incorporated from its inspected canvas and completed text handoff; its full native-window screenshot includes unrelated chat context and was not attached to Image Gen.

Generated pixels are concept illustrations, not exact application screenshots. Option 1 invents a Total capture region and mixes context examples. Option 2 also mixes context examples. Option 3 carried over the local prototype's reconstructed screen and invented wash/dry copy despite instructions to exclude it. Those details must be replaced with the real iframe/registry/captured context before implementation. Selecting a shell does not approve those inaccuracies or care guidance.

Product Design's ideation workflow requires an explicit visual selection before build. The application UI, local access controls, synthetic records and existing feedback remain unchanged in this pass.

## Interaction review

| Before | Proposed after | Why |
| --- | --- | --- |
| Tall setup area before the preview | Compact contextual control; preview first on mobile | Preserve attention for the task being reviewed. |
| All specimens equally prominent | Group working journeys; collapse partial specimens | Reach a useful state without scanning a long catalogue. |
| Feedback and every screenshot below the preview | Contextual compose panel and compact saved-note list | Keep the reviewed state visible while writing. |
| Navigation and keyboard actions treated as animation opportunities | Instant keyboard navigation; short purposeful sheet/feedback transitions | Frequent actions should feel immediate. |
| A generic completion marker | Separate preview/design/browser/device evidence | Show exactly what is proved and what remains open. |

## Sources

- [Figma design basics](https://www.figma.com/resource-library/design-basics/)
- [Claude Design proposal conversation](https://claude.ai/cowork/cse_01RDvjo76ZzDMpw5FDXAGhQT?artifact=09ab05e9-aca3-4553-a601-a42fc144eddd)
- Local desktop project: `c2383e11-71dc-463a-aea0-a7f2aaefac7f`
- [Product brief](PRODUCT.md)
