# Product

<!-- impeccable:product-schema 1 -->

## Platform

The eventual product is a native app. This responsive web build is a trial vehicle for the owner's real closet and laundry, with phone, tablet and desktop layouts. Design task screens as an app: focused entry, persistent navigation and clear care steps. Avoid website marketing heroes inside sign-in or household tasks.

Native apps use the platform's components and design system: Liquid Glass on Apple platforms and Material on Android. The web stays with shadcn, styled through the shared product tokens. Use subtle elevation to clarify surfaces and overlays while retaining the composed imagery and compact controls.

## Users

Busy people living alone, college students and families, including single mothers and other single parents, caring for their clothes and linens. The app must be approachable without technical laundry knowledge. They organize clothes at home and follow care steps at a washer, dryer or elsewhere. Phone machine steps need easy one-handed use; editing, planning and desktop use need compact, readable controls.

The owner's specific target audiences are busy upper-middle-class singles protecting expensive clothes, including people who delegate care; teens and newly independent students learning clothing/linen care and frequency; and a single mother managing a household of five. These are product intentions, not validated research personas. Serve other households and every budget equally: price is not a proxy for whose clothes deserve accurate care. The canonical OpenDesign `AUDIENCE.md` records the detailed needs and inclusive service principles under [the design contract](../../docs/design/opendesign.md).

## Product Purpose

Keep the household's clothes cared for: what is ready, what needs washing, refresh or dry cleaning, and what care each garment has received. Laundry is the recurring care loop. Machines and products support it.

## Positioning

The person answers practical questions about their clothes and labels. The app decides compatible washes, settings, doses and drying, and shows one next step with an explanation when needed. Products are configured from the household's own labels, rather than through shopping recommendations.

## Operating Context

- Home: the household's next useful action and a readable care overview.
- Closet: everything owned, search, readiness, matching pieces and care history. A care action chooses how many matching pieces it applies to; different colors remain separate.
- Laundry: waiting clothes, a review of the wash plan, missing details, active washing and drying. Planning opens an overview rather than choosing an unexpected garment question.
- Household: people, real appliances and products, including shared-room counts and costs.
- Me: completed laundry history and links to Account and Settings. Account owns credentials/sign-out/deletion; Settings owns appearance, device and measurement preferences.
- At a machine: a clear current step and one prominent action. Recorded execution taps have explicit durable recovery; other pending offline edits remain memory-only.

## Capabilities and Constraints

- Public catalog candidates stay separate from private household holdings, nicknames, labels and overrides. Preserve identity/source revisions and actual recorded-use context without promoting researched candidates into confirmed care. Matching-piece records from one wash are one independent observation; inventory entry is not proof of purchase, planned outfits are not reported wear, and removal is not proof of garment failure. Catalog reuse does not authorize commercial collection or sharing. The implemented boundary and remaining ingestion work are in [fixture research](../../docs/plans/2026-10-03-fixture-research.md#reusable-catalog-and-private-activity-foundation--implemented).

- Care symbols and confirmed product directions constrain care and doses. Catalog identity alone does not confirm care or cap marks.
- Missing care needs confirmation. A checked label that gives no answer uses conservative care; unknown never means steam, bleach or tumble drying is allowed.
- The need for refresh is separate from the methods the care label permits.
- Matching clothes are managed as quantities, including packs bought at different times. Never require someone to identify or number identical undershirts. Stains are optional quantity-based exceptions; purchase dates and internal wash counters must not split the normal experience.
- Care history records events and quantities. Internal garment records support planning and readiness; they do not establish which indistinguishable physical shirt was washed. Future put-away guidance must build on recorded events.
- Completed wash and separate-dryer records preserve equipment, selected-product/dose and preparation context, treatment/advice statuses and person-confirmed dryness. Displayed timer starts remain separate from program suggestions; pieces removed early do not inherit later starts. The private assessment editor uses one versioned API for dimension/stage results, explicit unknown/clear, correction history and safe retries. Unsaved drafts survive live updates without moving to another wash. Personal adaptation remains open under [current delivery status](../../docs/plans/2026-10-03-delivery-status.md).
- A stale or blocked plan cannot start. Proposed washes cannot include unresolved garments as if their care were known.
- Trial fixtures are illustrative, with unconfirmed care. They are not proof of real household setup or safe instructions.
- Trash retains removed garments for 30 days; archive preserves history separately.
- Planned post-trial: named storage locations and preference-aware folding, rolling and hanging guidance during put-away, with optional evidence-qualified storage-accessory advice. This is not implemented; scope and evidence limits are in the [storage feature brief](../../docs/plans/2026-10-05-garment-storage-and-put-away.md).
- Web Push software is implemented and tested. Trial credentials and delivery with the installed phone app closed remain unverified; do not present alerts as dependable until device acceptance.
- Outcome assessments, evidence-scoped product benefit checks and narrow printed-apparel preparation advice are implemented. Optional additions require an explicit choice; owning a product never selects it. Advice stays separate from labels, with visible source and revocable piece-scoped reminders. Broader contextual precautions and personal/global learning remain open. Use [current delivery status](../../docs/plans/2026-10-03-delivery-status.md) for scope and proof.

## Brand Commitments

The planned name is **A Laundered Closet**: “your closet, cared for.” WashCloset is the current working name. The experience should feel elegant, modern and upscale through coherent typography, considered spacing and precise details, while remaining warm, affordable-feeling and easy for the people described above. Elegance must not add ceremony or make routine care harder.

The canonical OpenDesign workspace owns the current visual direction; prototype variant E and compact Home are historical inputs. Tactile garment imagery, integrated fades, readable surfaces and subtle floating navigation guide the trial. The current blue interaction accent is retained by the canonical design. The owner's Browser Company reference informs restrained elegance and expressive identity, not copying its logo, proprietary fonts or guessed colors. Old teal/back-label styling is historical.

Typography serves the task: readable sans headings and body, clear role sizes and restrained weights. React implements OpenDesign's completed typography handoff with self-hosted, licensed Source Sans 3 for tasks and Source Serif 4 for the wordmark and sparse short brand/welcome statements. Native stacks remain fallbacks. Current implementation tokens live in packages/tokens/src; historical DESIGN.md values must not override canonical decisions. Source and phone delivery evidence are recorded in [the typography receipt](../../docs/plans/2026-10-05-typography-integration.md).

The butler/maid metaphor means attentive service, fewer decisions and clear next actions. It is an internal design standard, not a wealth signal or a claim that the app does physical laundry. Keep everyday and expensive clothing equally respected, explanations available without condescension, and shared facilities/budget-conscious routines supported.

## Evidence on Hand

Owner feedback and approved prototype direction, care labels, product directions and machine specifications. Fixture values require verification. No customer metrics, testimonials or unsupported care claims may be invented.

## Product Principles

1. Clothes are the subject; laundry is how they are cared for.
2. Home, Closet and Laundry have distinct jobs and consistent counts and state names.
3. Show context before asking questions. Name the garment, product or machine involved.
4. Make transitions visible: waiting for care, in progress, then ready again.
5. Keep related information close, separate sections clearly, and use one primary action per task.
6. Keep safety constraints and uncertainty visible without repeating explanations everywhere.

## Accessibility & Inclusion

Readable body text, sufficient contrast, keyboard and screen-reader access, browser zoom and text scaling. Controls meet accessible target sizes. Oversized headings and full-width buttons are not a universal substitute for hierarchy; larger machine actions are justified by that use scene.
