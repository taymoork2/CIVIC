import { defineSchema, defineTable } from 'convex/server'
import { dryerDurationSuggestion } from './dryerContextValues'
import { v } from 'convex/values'
import { fabricDetails } from './validators'
import { catalogBinding, catalogClaim, catalogKind, catalogSource } from './catalogValues'
import { careInstructions, washProcesses } from './careInstructions'
import { personalRoutine } from './personalRoutineValues'
import { garmentDecoration, adviceReminder, adviceContext } from './garmentAdviceValues'
import { outcomeDimension, outcomeStage, assessedResult } from './outcomeValues'
import { householdWater } from './waterHardness'

import {
  guidanceState,
  applianceType,
  availability,
  bleach,
  careStatus,
  colorPolicy,
  cycleProfile,
  dryingRunContext,
  rinseContact,
  dispensingProfile,
  dose,
  drumVolume,
  dryMethod,
  dyeRun,
  preOwned,
  dryerHeat,
  dryingSnapshot,
  dryingMethod,
  dryingPreference,
  driedWith,
  methodEvidenceValue,
  methodSource,
  neededByValue,
  evidenceLevel,
  formulation,
  garmentKind,
  heatSetting,
  startLoadBasis,
  heavyLightMixing,
  ironSteam,
  loadSize,
  machineEventDetails,
  machineLocation,
  occasion,
  outfitItem,
  optimization,
  plannerMode,
  provenance,
  catalogCandidate,
  preparationContext,
  preparedGarmentContext,
  usedProductContext,
  startedMachineContext,
  productSafety,
  productRequirement,
  productLoadConfirmation,
  laundryObservation,
  treatmentOutcome,
  wearerRequirements,
  stainKind,
  stainChemistry,
  ruleConditions,
  rulePlacement,
  soilLevel,
  stage,
  stepPhase,
  actionStatus,
  supplyKind,
  supplyMeasure,
  supplyUse,
  textileFlag,
  knownStain,
  stainCheck,
  textileIdentity,
  textileStatus,
  timelineAction,
  washMethod,
  wearerKind,
} from './validators'

/** Planner input and output are the planner's own types; they are typed at the one place they are read. */
const plannerDocument = v.any()

export default defineSchema({
  /** Retained save identities prevent a stale tab from recreating a completed intake. */
  intakeSaves: defineTable({
    householdId: v.id('households'), principalKey: v.string(),
    kind: v.union(v.literal('garment'), v.literal('appliance'), v.literal('product'), v.literal('wearer'), v.literal('outfit')),
    key: v.string(), payloadHash: v.string(),
    result: v.union(v.array(v.id('textiles')), v.array(v.id('machines')), v.id('supplies'), v.id('wearers')),
  }).index('by_request', ['householdId', 'principalKey', 'kind', 'key']).index('by_principal', ['principalKey']),
  /** Shared factual evidence; private holdings and care permissions stay in household tables. */
  catalogProducts: defineTable({
    key: v.string(), kind: catalogKind, brand: v.string(), name: v.string(), createdAt: v.number(),
  }).index('by_key', ['key']).index('by_kind_brand', ['kind', 'brand']),
  catalogVariants: defineTable({
    key: v.string(), productId: v.id('catalogProducts'), name: v.string(), market: v.string(),
    packIdentifier: v.string(), createdAt: v.number(),
  }).index('by_key', ['key']).index('by_product', ['productId']),
  /** Immutable normalized extraction, bound to input, retriever and extractor versions. */
  catalogRevisions: defineTable({
    variantId: v.id('catalogVariants'), digest: v.string(), labelRevision: v.string(),
    retrieverVersion: v.string(), extractorVersion: v.string(), inputSha256: v.string(),
    sources: v.array(catalogSource), claims: v.array(catalogClaim), createdAt: v.number(),
  }).index('by_digest', ['digest']).index('by_variant', ['variantId']),
  /** Append-only reviews retain rejected/conflicting claims instead of rewriting extraction. */
  catalogReviews: defineTable({
    revisionId: v.id('catalogRevisions'), acceptedClaimIds: v.array(v.string()),
    rationale: v.string(), reviewer: v.string(), createdAt: v.number(),
  }).index('by_revision', ['revisionId']),
  principals: defineTable({
    principalKey: v.string(),
    issuer: v.string(),
    subject: v.string(),
    createdAt: v.number(),
  }).index('by_principal_key', ['principalKey']),

  people: defineTable({
    principalKey: v.string(),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_principal_key', ['principalKey']),

  households: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    washPlace: v.optional(v.union(v.literal('home'), v.literal('shared'), v.literal('laundromat'), v.literal('both'))),
    planning: v.optional(v.object({
      colorPolicy: v.optional(colorPolicy),
      heavyLightMixing: v.optional(heavyLightMixing),
      optimization: v.optional(optimization),
      preferredMachineId: v.optional(v.id('machines')),
      preferredDryerId: v.optional(v.id('machines')),
      currency: v.optional(v.string()),
      washerPricePerStart: v.optional(v.number()),
      dryerPricePerStart: v.optional(v.number()),
      /** Wash baby clothes on their own; unset is on. */
      babySeparate: v.optional(v.boolean()),
      /** The household's water hardness: ZIP as typed, never coordinates (waterHardness.ts). */
      water: v.optional(householdWater),
      /** Wash and dryer minutes as the household estimated them, asked once; `askedAt` also records "Not now". */
      times: v.optional(v.object({ washMinutes: v.optional(v.number()), dryerMinutes: v.optional(v.number()), askedAt: v.number() })),
      /** Loads the drying rack or line holds (default 1) and loads a day when spread out (default 2); design 5.6 and 6.2. */
      day: v.optional(v.object({ rackLoads: v.optional(v.number()), loadsPerDay: v.optional(v.number()), pace: v.optional(v.union(v.literal('all'), v.literal('spread'))), finishBy: v.optional(v.string()) })),
    })),
    /** Closet preferences; each unset value takes its default (7, 1, 7 and 90 days; the creator). */
    closet: v.optional(v.object({
      hamperDays: v.optional(v.number()),
      wetDays: v.optional(v.number()),
      cleanerDays: v.optional(v.number()),
      notWornDays: v.optional(v.number()),
      laundryPersonKey: v.optional(v.string()),
    })),
  }).index('by_creator', ['createdBy']),

  places: defineTable({
    householdId: v.id('households'),
    name: v.string(),
    kind: v.union(v.literal('home'), v.literal('shared'), v.literal('laundromat')),
    zip: v.optional(v.string()),
    water: v.optional(householdWater),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_household', ['householdId']),

  /** Who wears a household's clothes: a name tag, not an account. */
  wearers: defineTable({
    householdId: v.id('households'),
    name: v.string(),
    kind: wearerKind,
    principalKey: v.optional(v.string()),
    privacy: v.optional(v.object({
      default: v.union(v.literal('shared'), v.literal('private')),
      places: v.array(v.object({ placeId: v.id('places'), privacy: v.union(v.literal('shared'), v.literal('private')) })),
    })),
    placeId: v.optional(v.id('places')),
    /** Product requirements that apply to every product stage for this person's clothes. */
    requirements: v.optional(wearerRequirements),
    createdAt: v.number(),
  }).index('by_household', ['householdId']).index('by_household_principal', ['householdId', 'principalKey']),

  memberships: defineTable({
    householdId: v.id('households'),
    principalKey: v.string(),
    role: v.union(v.literal('owner'), v.literal('member'), v.literal('helper'), v.literal('guest')),
    currentPlaceId: v.optional(v.id('places')),
    placeIds: v.optional(v.array(v.id('places'))),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    firstHamperNotePending: v.optional(v.boolean()),
    guidance: v.optional(guidanceState),
  })
    .index('by_household', ['householdId'])
    .index('by_principal', ['principalKey'])
    .index('by_household_principal', ['householdId', 'principalKey']),

  householdInvites: defineTable({
    householdId: v.id('households'),
    codeHash: v.string(),
    createdBy: v.string(),
    name: v.optional(v.string()),
    /** The person in Household > People this invite is for; joining links the account to them. */
    wearerId: v.optional(v.id('wearers')),
    role: v.optional(v.union(v.literal('owner'), v.literal('member'), v.literal('helper'), v.literal('guest'))),
    placeIds: v.optional(v.array(v.id('places'))),
    expiresAt: v.optional(v.number()),
    usedBy: v.optional(v.string()),
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_code_hash', ['codeHash'])
    .index('by_wearer', ['wearerId'])
    .index('by_household', ['householdId']),

  /** Trial feedback from members; only owners read it. Never holds passwords, tokens or emails. */
  feedback: defineTable({
    householdId: v.id('households'),
    principalKey: v.string(),
    kind: v.union(v.literal('bug'), v.literal('confusing'), v.literal('idea'), v.literal('other')),
    message: v.string(),
    screen: v.optional(v.string()),
    buildId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    status: v.union(v.literal('new'), v.literal('seen'), v.literal('done')),
  }).index('by_household_created', ['householdId', 'createdAt']),

  collections: defineTable({
    householdId: v.id('households'),
    ownerPrincipalKey: v.string(),
    name: v.string(),
    createdAt: v.number(),
  })
    .index('by_household', ['householdId'])
    .index('by_owner', ['ownerPrincipalKey']),

  /** Each member's current pick for a wearer; choosing clothes does not record wear. */
  dailyOutfits: defineTable({
    householdId: v.id('households'),
    principalKey: v.string(),
    wearerId: v.optional(v.union(v.id('wearers'), v.null())),
    date: v.string(),
    items: v.array(outfitItem),
  }).index('by_household_principal', ['householdId', 'principalKey']),

  textiles: defineTable({
    householdId: v.id('households'),
    collectionId: v.id('collections'),
    ownerPrincipalKey: v.string(),
    templateId: v.optional(v.string()),
    private: v.optional(v.boolean()),
    fixtureKey: v.optional(v.string()),
    name: v.string(),
    color: v.optional(v.string()),
    colorGroup: v.optional(v.string()),
    firstWash: v.optional(v.boolean()),
    dyeRun: v.optional(dyeRun),
    /** Thrift or hand-me-down: destination chosen separately, dye unknown until one wash. */
    preOwned: v.optional(preOwned),
    bulkUnits: v.optional(v.number()),
    status: textileStatus,
    /** How dirty the garment is while it waits for a wash; cleared when it is washed. */
    soilLevel: v.optional(soilLevel),
    washCount: v.number(),
    careId: v.optional(v.id('care')),
    kind: v.optional(garmentKind),
    wearerId: v.optional(v.id('wearers')),
    /** Legacy explicitly assigned occasions; newer clients use tags. */
    occasions: v.optional(v.array(occasion)),
    tags: v.optional(v.array(v.string())),
    flag: v.optional(textileFlag),
    /** An old, set-in stain kept as a known mark; it never holds up washing. */
    knownStain: v.optional(knownStain),
    /** A washed stain waiting for "Stain gone?", or for what to do when it stayed. */
    stainCheck: v.optional(stainCheck),
    /** The last check answered gone, kept so a later "still there" for that wash re-opens it with its tries. */
    stainCleared: v.optional(stainCheck),
    /** When `status` last changed; read as `statusSince ?? createdAt`. */
    statusSince: v.optional(v.number()),
    lastWornAt: v.optional(v.number()),
    wearsSinceClean: v.optional(v.number()),
    lastCleanedAt: v.optional(v.number()),
    cleanerNote: v.optional(v.string()),
    cleanerPickupBy: v.optional(v.number()),
    identity: v.optional(textileIdentity),
    catalogCandidate: v.optional(catalogCandidate),
    catalogBinding: v.optional(catalogBinding),
    /** A guest's garment washed once: never shown in Closet, and deleted when its load completes. */
    guest: v.optional(v.boolean()),
    /** "Remember for this garment": the drying method used instead of the label's until "Follow label again". */
    dryingPreference: v.optional(dryingPreference),
    personalRoutine: v.optional(personalRoutine),
    decoration: v.optional(garmentDecoration),
    adviceReminder: v.optional(adviceReminder),
    routineRevision: v.optional(v.number()),
    routineWashId: v.optional(v.id('sessions')),
    /** Hidden from active care until restored or automatically purged 30 days later. */
    trashedAt: v.optional(v.number()),
    trashRevision: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_household', ['householdId'])
    .index('by_household_status', ['householdId', 'status'])
    .index('by_collection', ['collectionId'])
    .index('by_owner', ['ownerPrincipalKey']),

  care: defineTable({
    householdId: v.id('households'),
    textileId: v.id('textiles'),
    material: v.optional(v.string()),
    fabricDetails: v.optional(fabricDetails),
    washMethod: v.optional(washMethod),
    cycle: v.optional(v.string()),
    maxTemperatureC: v.optional(v.number()),
    restrictions: v.array(v.string()),
    instructions: v.optional(careInstructions),
    dryMethod: v.optional(dryMethod),
    /** The hottest dryer heat the label allows; stored only with `tumble_dry`. */
    dryHeat: v.optional(dryerHeat),
    ironSteam: v.optional(ironSteam),
    /** Iron permission retained separately from its heat limit and steam instructions. */
    ironHeat: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
    steamPermission: v.optional(ironSteam),
    /** The tag's bleach triangle; unset when the tag doesn't say. */
    bleach: v.optional(bleach),
    status: careStatus,
    provenance,
    createdAt: v.number(),
  }).index('by_textile', ['textileId']),

  carePhotos: defineTable({
    householdId: v.id('households'),
    textileId: v.id('textiles'),
    storageId: v.id('_storage'),
    contentType: v.string(),
    size: v.number(),
    uploadedBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_textile', ['textileId'])
    .index('by_storage', ['storageId'])
    .index('by_uploader', ['uploadedBy']),

  supplies: defineTable({
    householdId: v.id('households'),
    ownerPrincipalKey: v.string(),
    /** "Ran out" at the machine: left out of plans until restocked. Nothing is swapped in for it. */
    ranOutAt: v.optional(v.number()),
    fixtureKey: v.optional(v.string()),
    catalogBinding: v.optional(catalogBinding),
    name: v.string(),
    kind: supplyKind,
    safety: v.optional(productSafety),
    formulation: v.optional(v.union(v.string(), formulation)),
    measure: v.optional(supplyMeasure),
    /** What the product is for; `useDirections` derives its kind, stage, placement and timing. */
    use: v.optional(supplyUse),
    archived: v.optional(v.boolean()),
    provenance,
    createdAt: v.number(),
  }).index('by_household', ['householdId']),

  rules: defineTable({
    householdId: v.id('households'),
    supplyId: v.id('supplies'),
    fixtureKey: v.optional(v.string()),
    conditions: ruleConditions,
    dose,
    stage,
    placement: rulePlacement,
    timing: v.string(),
    /** The label-directions row this rule was transcribed from; an or-row stores two rules with one row. */
    row: v.optional(v.number()),
    rowText: v.optional(v.string()),
    incompatibleSupplyIds: v.optional(v.array(v.id('supplies'))),
    incompatibleMaterials: v.optional(v.array(v.string())),
    sharedCompartmentCompatible: v.optional(v.boolean()),
    maximumTemperatureC: v.optional(v.number()),
    stainChemistry: v.optional(stainChemistry),
    stainKinds: v.optional(v.array(stainKind)),
    safeMaterials: v.optional(v.array(v.string())),
    maximumPH: v.optional(v.number()),
    provenance,
    createdAt: v.number(),
  }).index('by_household', ['householdId']),

  machines: defineTable({
    householdId: v.id('households'),
    placeId: v.optional(v.id('places')),
    name: v.string(),
    model: v.optional(v.string()),
    fixtureKey: v.optional(v.string()),
    catalogBinding: v.optional(catalogBinding),
    applianceType: v.optional(applianceType),
    /** HE as recorded from the plate or manual; unset is unknown, whatever the washer type. */
    highEfficiency: v.optional(v.boolean()),
    heatSettings: v.optional(v.array(heatSetting)),
    capacityUnits: v.optional(v.number()),
    capacityConfidence: v.optional(evidenceLevel),
    supportedCycles: v.optional(v.array(v.string())),
    pool: availability,
    location: v.optional(machineLocation),
    pricePerStart: v.optional(v.number()),
    /** Minutes one `pricePerStart` buys; dryers paid per time block. */
    blockMinutes: v.optional(v.number()),
    /** The drum volume as typed from the sticker; `capacityUnits` and `capacityConfidence` are derived from it. */
    drumVolume: v.optional(drumVolume),
    archived: v.optional(v.boolean()),
    dispensingProfile,
    cycleProfile: v.optional(cycleProfile),
    rinseContact: v.optional(rinseContact),
    washProcesses: v.optional(washProcesses),
    provenance,
    createdAt: v.number(),
  }).index('by_household', ['householdId']),

  /**
   * One current plan per household and canonical selection. Edits mark plans stale; the next
   * recompute deletes stale and superseded plans, retiring the ones a session still refers to.
   */
  plans: defineTable({
    householdId: v.id('households'),
    createdBy: v.string(),
    plannerVersion: v.string(),
    inputHash: v.string(),
    /** SHA-256 of the sorted textile selection; absent on plans made before selections were keyed. */
    selectionKey: v.optional(v.string()),
    textileIds: v.optional(v.array(v.id('textiles'))),
    inputSnapshot: plannerDocument,
    result: plannerDocument,
    documentParts: v.optional(v.object({ inputSnapshot: v.number(), result: v.number() })),
    /** Unset is normal planning. */
    mode: v.optional(plannerMode),
    status: v.union(v.literal('ready'), v.literal('needs_confirmation'), v.literal('used'), v.literal('stale'), v.literal('retired')),
    /**
     * "Confirm recipe": the washer a person said they are at for a load, and that they read its
     * recipe. Confirming is not starting; it lives on the plan so any change to the recipe (a new
     * plan) asks again.
     */
    recipeConfirmations: v.optional(v.array(v.object({ loadId: v.string(), machineId: v.id('machines'), confirmedBy: v.string(), confirmedAt: v.number() }))),
    /** Laundry day "Wash now, hang to dry": these pieces skip the dryer this time and queue on a rack (design 6.1). */
    hangTextileIds: v.optional(v.array(v.id('textiles'))),
    createdAt: v.number(),
  })
    .index('by_household_status', ['householdId', 'status'])
    .index('by_household_selection', ['householdId', 'selectionKey']),

  planDocuments: defineTable({
    planId: v.id('plans'),
    field: v.union(v.literal('inputSnapshot'), v.literal('result')),
    position: v.number(),
    text: v.string(),
  }).index('by_plan', ['planId']),

  sessions: defineTable({
    /** Immutable identity/care context when preparation began; old sessions may have none. */
    preparationContext: v.optional(preparationContext),
    washerContext: v.optional(startedMachineContext),
    householdId: v.id('households'),
    planId: v.id('plans'),
    placeId: v.optional(v.id('places')),
    loadId: v.optional(v.string()),
    /** The load as the plan showed it when it started: its name, its number and how many loads the day had. */
    loadName: v.optional(v.string()),
    loadNumber: v.optional(v.number()),
    loadCount: v.optional(v.number()),
    /** The planned cycle, copied from the load so lists need not read the plan. */
    cycle: v.optional(v.string()),
    textileIds: v.array(v.id('textiles')),
    startedBy: v.string(),
    /** Who created the laundry plan: its dryer reminders go to them after the plan is released. */
    planCreatedBy: v.optional(v.string()),
    idempotencyKey: v.string(),
    status: v.union(v.literal('planned'), v.literal('running'), v.literal('completed'), v.literal('cancelled')),
    revision: v.number(),
    startedAt: v.optional(v.number()),
    machineStartedAt: v.optional(v.number()),
    /** The minutes the washer showed when it was started: the timer counts from these, not a guess. */
    cycleMinutesShown: v.optional(v.number()),
    washFinishedAt: v.optional(v.number()),
    dryerStartedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    /** How full the drum and the dryer looked: the load size for every dose that depends on it. */
    drumFullness: v.optional(loadSize),
    dryerFullness: v.optional(loadSize),
    /** Started with "No number on it?": the kind of washer is known, not which one. */
    washerNumberUnknown: v.optional(v.boolean()),
    /** "Drawer is stuck or missing": this load's steps are planned as if its washer had no drawer. */
    drawerUnusable: v.optional(v.boolean()),
    /** The accepted no-drawer load; timing changes must not re-plan it from live inventory. */
    drawerlessLoad: v.optional(plannerDocument),
    /** Accepted recovery of one pending product placement; other instructions remain unchanged. */
    placementRecoveryLoad: v.optional(plannerDocument),
  })
    .index('by_household', ['householdId'])
    .index('by_household_status', ['householdId', 'status'])
    .index('by_idempotency', ['householdId', 'idempotencyKey'])
    .index('by_household_status_completed', ['householdId', 'status', 'completedAt'])
    .index('by_plan', ['planId'])
    .index('by_plan_load_status', ['planId', 'loadId', 'status']),

  timelines: defineTable({
    householdId: v.id('households'),
    sessionId: v.id('sessions'),
    machineId: v.optional(v.id('machines')),
    dryerId: v.optional(v.id('machines')),
    /** The person said which dryer they are at ("Which dryer?"), so it is not asked again. */
    dryerChosen: v.optional(v.boolean()),
    drying: v.optional(dryingSnapshot),
    startedAt: v.number(),
    actions: v.array(timelineAction),
    status: v.union(v.literal('pending'), v.literal('completed'), v.literal('cancelled')),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index('by_session', ['sessionId']),

  /**
   * A step reminder (unset `kind`), or one heads-up to the laundry person about an urgent flag.
   * A step reminder always has `sessionId` and `actionId`; that is checked in code. `dryer_done`
   * names a drying-queue run (`dryingRunId`) and is due at its current end; `dryer_check` names one
   * due at its planned mid-run check (`midCheck.checkAt`); `start_load` names a
   * plan load not started yet (`planId`, `loadId`) and the dryer time it was held back from
   * (`basis`). Neither has a session.
   */
  reminders: defineTable({
    householdId: v.id('households'),
    kind: v.optional(v.union(v.literal('step'), v.literal('urgent_flag'), v.literal('dryer_done'), v.literal('start_load'), v.literal('dryer_check'))),
    sessionId: v.optional(v.id('sessions')),
    dryingRunId: v.optional(v.id('dryingRuns')),
    planId: v.optional(v.id('plans')),
    loadId: v.optional(v.string()),
    actionId: v.optional(v.string()),
    scheduledFunctionId: v.optional(v.id('_scheduled_functions')),
    status: v.union(v.literal('scheduled'), v.literal('cancelled'), v.literal('sent'), v.literal('completed')),
    dueAt: v.number(),
    recipientPrincipalKey: v.optional(v.string()),
    textileIds: v.optional(v.array(v.id('textiles'))),
    flaggedBy: v.optional(v.string()),
    flagKey: v.optional(v.string()),
    neededBy: v.optional(v.number()),
    shownAt: v.optional(v.number()),
    /** A `start_load` hold's timing basis: the run or wash session whose end it is timed from, that end, and whether the person typed it ("Dryer says"). */
    basis: v.optional(startLoadBasis),
  })
    .index('by_session', ['sessionId'])
    .index('by_recipient_status', ['recipientPrincipalKey', 'status'])
    .index('by_flag_key', ['householdId', 'flagKey'])
    .index('by_drying_run', ['dryingRunId'])
    .index('by_plan', ['planId']),

  machineExecutionEvents: defineTable({
    householdId: v.id('households'),
    sessionId: v.id('sessions'),
    machineId: v.optional(v.id('machines')),
    source: v.union(v.literal('manual'), v.literal('estimated'), v.literal('vendor_api')),
    phase: v.string(),
    confidence: evidenceLevel,
    occurredAt: v.number(),
    details: machineEventDetails,
  }).index('by_session', ['sessionId']),

  usage: defineTable({
    /** Captured when recorded as applied; later product edits cannot rewrite this evidence. */
    productContext: v.optional(usedProductContext),
    productName: v.optional(v.string()),
    householdId: v.id('households'),
    sessionId: v.id('sessions'),
    actionId: v.optional(v.string()),
    supplyId: v.id('supplies'),
    amount: v.number(),
    unit: v.string(),
    mark: v.optional(v.string()),
    fractionOfMark: v.optional(v.number()),
    target: dose.fields.target,
    approximate: dose.fields.approximate,
    placement: v.string(),
    usedAt: v.number(),
    confirmedBy: v.string(),
  }).index('by_session', ['sessionId']),

  /** The finished care conditions for one household garment, retained after its plan is released. */
  /**
   * A washed piece waiting to dry, drying, or dry and not yet put away. Dryer loads are planned from
   * these apart from wash loads; each piece keeps the washer it came out of until it is put away.
   */
  dryingPieces: defineTable({
    householdId: v.id('households'),
    textileId: v.id('textiles'),
    washSessionId: v.id('sessions'),
    washerName: v.string(),
    status: v.union(v.literal('queued'), v.literal('drying'), v.literal('dry')),
    /** The person moved it to air drying ("Air dry"); back in the dryer plan when cleared. */
    air: v.optional(v.boolean()),
    /** A stain went into this wash; heat would set what is left, so it air dries until someone checks it is gone. */
    stained: v.optional(v.boolean()),
    /** "Own dryer load": planned alone instead of sharing a load; "Merge back" clears it. */
    ownLoad: v.optional(v.boolean()),
    dryingRunId: v.optional(v.id('dryingRuns')),
    /** The dryer it dried in; absent when it air dried. */
    driedIn: v.optional(v.string()),
    /** "This time only": the method for this wash; it ends when the piece is put away. */
    method: v.optional(dryingMethod),
    /** "Needed by": a coarse priority for ordering; no finish time is estimated. */
    need: v.optional(neededByValue),
    /** The method it started drying with, where that came from, and what the label says about it. */
    dried: v.optional(driedWith),
    /** Taken out at a mid-run check and hung: the tumble before it ("tumbled 15 min, then hung"). */
    tumbledFirst: v.optional(v.object({ runId: v.id('dryingRuns'), minutes: v.number(), dryerName: v.optional(v.string()), heat: v.optional(v.string()) })),
    queuedAt: v.number(),
  })
    .index('by_household', ['householdId'])
    .index('by_wash_session', ['washSessionId'])
    .index('by_run', ['dryingRunId']),

  /** One dryer started with some queued pieces, or one batch of pieces hung to air dry. */
  dryingRuns: defineTable({
    /** New starts retain immutable equipment, selected-product and load context. */
    activityContext: v.optional(dryingRunContext),
    householdId: v.id('households'),
    kind: v.union(v.literal('dryer'), v.literal('air')),
    dryerId: v.optional(v.id('machines')),
    dryerName: v.optional(v.string()),
    heat: v.optional(v.string()),
    heatLabel: v.optional(v.string()),
    startedAt: v.number(),
    /** The minutes the dryer showed when started (or restarted for damp pieces). */
    minutes: v.optional(v.number()),
    /** Suggested time is separate from the actual displayed timer and confirmed dryness. */
    durationSuggestion: v.optional(dryerDurationSuggestion),
    status: v.union(v.literal('running'), v.literal('done')),
    startedBy: v.string(),
    /** Air runs: rack or line, flat, or a heated hanging dryer (named in `dryerName`). */
    method: v.optional(dryingMethod),
    /** Earlier starts of this run (each a payment) before the latest restart for damp pieces. */
    earlier: v.optional(v.array(v.object({ startedAt: v.number(), minutes: v.number() }))),
    /** The person chose the heat at the dryer because the label sets none for a piece. */
    heatChosen: v.optional(v.boolean()),
    /** Dryer products actually added, with the dose as recorded at the time. */
    products: v.optional(v.array(v.object({ name: v.string(), amount: v.optional(v.number()), unit: v.optional(v.string()) }))),
    /**
     * The mid-run check planned at start (`midRunCheck`, design 8.4): the pieces to take out at about
     * `atMinute`. `checkedAt`: when someone checked before the end; `missed`: the run was first checked
     * at or after its end. A missed check is recorded, never called damage.
     */
    midCheck: v.optional(v.object({ checkAt: v.number(), atMinute: v.number(), pieceIds: v.array(v.id('dryingPieces')), reasons: v.array(v.string()),
      checkedAt: v.optional(v.number()), missed: v.optional(v.boolean()) })),
    /** Checks before the planned end: pieces taken out dry, hung, and left tumbling. The run's time is left alone. */
    earlyChecks: v.optional(v.array(v.object({ at: v.number(), dry: v.number(), hung: v.number(), left: v.number() }))),
  }).index('by_household_status', ['householdId', 'status']),

  washRecords: defineTable({
    /** Private activity context. Distinct session IDs, not garment rows, count independent washes. */
    activityContext: v.optional(v.object({
      version: v.union(v.literal(1), v.literal(2)), independentWashId: v.id('sessions'), quantity: v.literal(1),
      preparedAt: v.optional(v.number()), garment: v.optional(preparedGarmentContext),
      plannerVersion: v.string(), planInputHash: v.string(),
      machineStartedAt: v.optional(v.number()), cycleMinutesShown: v.optional(v.number()),
      washer: v.optional(startedMachineContext),
      load: v.optional(v.object({ pieceCount: v.number(), bulkUnits: v.number(), soilLevel: v.optional(soilLevel), drumFullness: v.optional(loadSize) })),
      products: v.array(v.object({ supplyId: v.id('supplies'), usedAt: v.number(), context: v.optional(usedProductContext),
        actionId: v.optional(v.string()), phase: v.optional(stepPhase), status: v.optional(actionStatus),
        amount: v.optional(v.number()), unit: v.optional(v.string()), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), placement: v.optional(v.string()),
        target: dose.fields.target, approximate: dose.fields.approximate,
      })),
      /** Reviewed steps retain skipped/unknown statuses separately from actual recorded use. */
      treatments: v.optional(v.array(v.object({ actionId: v.string(), supplyId: v.string(), phase: stepPhase,
        placement: v.string(), dose, status: actionStatus, reusable: v.optional(v.boolean()), recordedAt: v.optional(v.number()),
        productRequirement: v.optional(productRequirement),
        productConfirmation: v.optional(productLoadConfirmation),
      }))),
      advice: v.optional(v.array(v.object({ actionId: v.string(), advice: adviceContext, status: actionStatus, recordedAt: v.optional(v.number()) }))),
      washGoals: v.optional(v.array(v.string())), recommendationPolicies: v.optional(v.array(v.string())),
    })),
    householdId: v.id('households'),
    textileId: v.id('textiles'),
    sessionId: v.id('sessions'),
    completedAt: v.number(),
    washerName: v.union(v.string(), v.null()),
    cycle: v.string(),
    /** The app's planned wash temperature, not a machine temperature reading. */
    plannedTemperatureC: v.union(v.number(), v.null()),
    drying: v.object({
      /** Added only after a person's dryness check; legacy records remain without context. */
      activityContext: v.optional(v.object({ version: v.literal(1), runId: v.id('dryingRuns'),
        start: dryingRunContext,
        displayedStarts: v.array(v.object({ startedAt: v.number(), minutes: v.optional(v.number()) })),
        checkedAt: v.number(), recordedAt: v.number(), checkedBy: v.string(), telemetry: v.literal(false),
      })),
      /** `queued`: it went to the drying queue; set to how it dried once someone says it is dry. */
      outcome: v.union(v.literal('tumble_dried'), v.literal('left_hanging'), v.literal('queued')),
      method: v.optional(v.string()),
      dryerName: v.optional(v.string()),
      heat: v.optional(v.string()),
      minutes: v.optional(v.number()),
      /** label | once ("This time only") | preference ("Remember for this garment"). */
      scope: v.optional(methodSource),
      evidence: v.optional(methodEvidenceValue),
      /** The drying label as recorded, unchanged by any choice. */
      label: v.optional(v.string()),
      instructions: v.optional(careInstructions),
      process: v.optional(v.object({ shade: v.optional(v.boolean()), noDirectHeat: v.optional(v.boolean()), drip: v.optional(v.boolean()) })),
      personalRoutine: v.optional(personalRoutine),
      products: v.optional(v.array(v.string())),
      durationSuggestion: v.optional(dryerDurationSuggestion),
      /** Tumbled this long, then hung at a mid-run check. */
      tumbledMinutes: v.optional(v.number()),
      /** It was flagged for a mid-run check that nobody did before the end. Not a damage claim. */
      checkMissed: v.optional(v.boolean()),
    }),
    /** Retired fixture field. New assessments use the private outcomeAssessments table. */
    outcome: v.optional(treatmentOutcome),
    observation: v.optional(laundryObservation),
    /** Measured soak facts and label directions retained when the plan is retired. */
    soaks: v.optional(v.array(v.object({ productName: v.string(), startedAt: v.number(), waterLitres: v.number(), temperatureC: v.number(), amount: v.number(), unit: v.string(), minimumMinutes: v.number(), maximumMinutes: v.number(), transfer: v.string(), status: v.union(v.literal('confirmed'), v.literal('skipped'), v.literal('missed')) }))),
    /** Only products actually recorded as used, with their names and doses at the time. */
    products: v.array(v.object({
      name: v.string(),
      amount: v.number(),
      unit: v.string(),
      mark: v.optional(v.string()),
      fractionOfMark: v.optional(v.number()),
      target: dose.fields.target,
      approximate: dose.fields.approximate,
      placement: v.string(),
    })),
  })
    .index('by_textile', ['textileId', 'completedAt'])
    .index('by_textile_session', ['textileId', 'sessionId'])
    .index('by_outcome_reporter', ['outcome.recordedBy'])
    .index('by_session', ['sessionId']),

  /** Latest reviewed private influence per person/plan/load; shared plan inputs are not duplicated. */
  personalPlanGuidance: defineTable({
    householdId: v.id('households'), principalKey: v.string(), planId: v.id('plans'), loadId: v.string(),
    supplyIds: v.array(v.id('supplies')), dimension: outcomeDimension, checkedWhen: outcomeStage,
    plannerVersion: v.string(), inputHash: v.string(), personalInput: plannerDocument,
    revision: v.number(), savedAt: v.number(),
  }).index('by_plan_principal_load', ['planId', 'principalKey', 'loadId'])
    .index('by_plan', ['planId']).index('by_principal', ['principalKey']),

  /** Indexed entry references let deletion erase a private load snapshot without scanning other people. */
  personalPlanGuidanceEntries: defineTable({
    guidanceId: v.id('personalPlanGuidance'), textileId: v.id('textiles'),
  }).index('by_guidance', ['guidanceId']).index('by_textile', ['textileId']),

  /** Person-scoped result influence; null textile scope applies to this household's own results. */
  personalAdaptationPreferences: defineTable({
    householdId: v.id('households'), principalKey: v.string(), textileId: v.union(v.id('textiles'), v.null()),
    enabled: v.boolean(), resetAt: v.number(), revision: v.number(),
  }).index('by_scope', ['householdId', 'principalKey', 'textileId'])
    .index('by_textile', ['textileId']).index('by_principal', ['principalKey']),

  /** One person's latest dimension/stage result for a piece in one independent wash. */
  outcomeAssessments: defineTable({
    householdId: v.id('households'), textileId: v.id('textiles'), recordId: v.id('washRecords'),
    independentWashId: v.id('sessions'), reporterKey: v.string(),
    dimension: outcomeDimension, checkedWhen: outcomeStage, result: assessedResult,
    note: v.optional(v.string()), revision: v.number(), recordedAt: v.number(),
    /** Wash completion time, independent of when a report was entered or corrected. */
    completedAt: v.optional(v.number()),
    /** Retired fixture marker; no assessment writer sets or reads it. */
    versioned: v.optional(v.boolean()),
  }).index('by_record_reporter', ['recordId', 'reporterKey'])
    .index('by_slot', ['recordId', 'reporterKey', 'dimension', 'checkedWhen'])
    .index('by_textile_reporter_result', ['textileId', 'reporterKey', 'result', 'completedAt'])
    .index('by_textile', ['textileId']).index('by_reporter', ['reporterKey']),

  /** Corrections and receipt acknowledgments; never additional independent observations. */
  outcomeAssessmentRevisions: defineTable({
    assessmentId: v.id('outcomeAssessments'), textileId: v.id('textiles'), reporterKey: v.string(),
    revision: v.number(), result: assessedResult, note: v.optional(v.string()), recordedAt: v.number(),
    receiptId: v.optional(v.string()), payloadHash: v.optional(v.string()),
  }).index('by_assessment_revision', ['assessmentId', 'revision'])
    .index('by_reporter_receipt', ['reporterKey', 'receiptId'])
    .index('by_textile', ['textileId']).index('by_reporter', ['reporterKey']),

  /** One row per garment state change; closet changes outside a session have no `sessionId`. */
  history: defineTable({
    householdId: v.id('households'),
    sessionId: v.optional(v.id('sessions')),
    textileId: v.id('textiles'),
    ownerPrincipalKey: v.string(),
    actionId: v.optional(v.string()),
    event: v.union(
      v.literal('personal_routine'),
      v.literal('washed'),
      v.literal('action_confirmed'),
      v.literal('action_skipped'),
      v.literal('action_missed'),
      v.literal('worn'),
      v.literal('flagged'),
      v.literal('dropped_at_cleaner'),
      v.literal('picked_up'),
      v.literal('refreshed'),
      v.literal('hung'),
      v.literal('dried'),
      v.literal('drying_preference'),
    ),
    occurredAt: v.number(),
    actorPrincipalKey: v.string(),
    details: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  })
    .index('by_session', ['sessionId'])
    .index('by_textile', ['textileId', 'occurredAt']),

  notificationSubscriptions: defineTable({
    principalKey: v.string(),
    deviceId: v.string(),
    endpointHash: v.string(),
    endpoint: v.optional(v.string()),
    keys: v.optional(v.object({ p256dh: v.string(), auth: v.string() })),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_principal', ['principalKey'])
    .index('by_device', ['principalKey', 'deviceId'])
    .index('by_endpoint', ['endpoint']),

  pushDeliveries: defineTable({
    reminderId: v.id('reminders'),
    subscriptionId: v.id('notificationSubscriptions'),
    status: v.union(v.literal('queued'), v.literal('sending'), v.literal('sent'), v.literal('failed'), v.literal('cancelled')),
    attempts: v.number(),
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
  }).index('by_reminder', ['reminderId']),
})
