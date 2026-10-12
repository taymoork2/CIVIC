import { readPlanDocuments } from './planStorage'
import { text, optionalText, positive, cycleName, provenance, type TextileFields, textileFields, occasionsFrom, tagsFrom, type TextileIdentity, identityFrom, type CareFields, tagEvidence, tagCare, nextSoil, ingredientList, formulation, dryerKind, measureFrom, doseFrom, assertMarksKept, assertUseFits, materialList, chemistryLimit, labelEvidence, type RowShape, sameShape, sameDose, storedShape, conditionsFrom, machineFields, siblingNames, siblingCount, wholeDays } from './inventoryHelpers'
export { provenance, type CareFields, tagEvidence, tagCare, labelEvidence, maxMachinesLikeIt, siblingNames } from './inventoryHelpers'
import { v, type Infer } from 'convex/values'
import { clothingTags } from '@washcloset/planner'
import { eraseOutcomeData } from './outcomeAssessments'
import { intakeSave } from './intakeSaves'
import { dryerProgramMode } from './dryerContextValues'

import { careRequirementProblem, washRequirementKinds, dryRequirementKinds, compileDirections, tagAllowsHighHeat, evidencePolicy, isDryer, isDryingMachine, machineRole, loadSizes, occasions, documentedHeatSettings, soilLevels, useDirections, type CareEvidence, type CompiledRule, type DirectionsRow, type LoadSize, type Occasion, type SoilLevel } from '@washcloset/planner'

import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { authorize, ownsCloset, related, visible, type Action, type ReadCtx } from './access'
import { fail } from './errors'
import { classifyWater, ebmudAreas, householdWater, mgLOf, qualifyingWaterCondition, softUntil, validZip, type HouseholdWater } from './waterHardness'
import { principalFromAuth } from './principal'
import { careInstructions, careInstructionKey, washProcesses, type CareInstructions } from './careInstructions'
import { routineCurrent } from './personalRoutineValues'
import { materialCareProblem, namedFiber, normalizeFabricDetails, type FabricDetails } from '@washcloset/planner'
import { fabricDetails as fabricDetailsValidator } from './validators'
import { busyTextiles, invalidatePlans, machinePlacements, recordedDryMethod, washerPlacements } from './plans'
import { applianceType, availability, bleach, colorGroup, dryMethod, dyeRun, preOwned as preOwnedValidator, drumVolume, dryerHeat, evidenceLevel, formulation as formulationValidator, productSafety, rinseContact, wearerRequirements, stainKind, stainChemistry, garmentKind, heatSetting, ironSteam, loadSize, machineLocation, occasion, placement, provenance as provenanceValidator, ruleConditions, rulePlacement, soilLevel, stage, supplyKind, supplyMeasure, supplyUse, textileIdentity, washMethod, washerClass, wearerKind, type Provenance, type SupplyMeasure } from './validators'







/** Loads a household-owned row after checking the caller is a member of that household. */
async function householdRow<T extends { householdId: Id<'households'> }>(ctx: ReadCtx, action: Action, row: T | null): Promise<T> {
  if (row === null) fail('not_found', 'Not found')
  await authorize(ctx, action, { householdId: row.householdId })
  return row
}

// ---- Read ------------------------------------------------------------------

/** Run only when places ship. Legacy fields remain readable; repeating never replaces a place or a choice. */
export const migratePlaces = internalMutation({
  args: { householdId: v.id('households') },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    const household = await ctx.db.get(householdId)
    if (household === null) fail('not_found', 'Not found')
    const machines = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    const places = await ctx.db.query('places').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    const kinds = household.washPlace === 'both' ? ['home', 'shared'] as const
      : household.washPlace !== undefined ? [household.washPlace]
      : [...new Set(machines.flatMap((machine) => machine.location === undefined ? [] : [machine.location]))].sort()
    const byKind = new Map(places.map((place) => [place.kind, place._id]))
    const names = { home: 'Home', shared: 'Shared laundry room', laundromat: 'Laundromat' }
    for (const kind of kinds) {
      if (byKind.has(kind)) continue
      const water = household.planning?.water
      const placeId = await ctx.db.insert('places', { householdId, kind, name: names[kind], createdAt: Date.now(),
        ...(water === undefined ? {} : { water }), ...(water?.zip === undefined ? {} : { zip: water.zip }) })
      byKind.set(kind, placeId)
    }
    for (const machine of machines) {
      const kind = household.washPlace === 'laundromat' && machine.location === 'shared' ? 'laundromat' : machine.location
      const placeId = kind === undefined ? (kinds.length === 1 ? byKind.get(kinds[0]!) : undefined) : byKind.get(kind)
      if (machine.placeId === undefined && placeId !== undefined) await ctx.db.patch(machine._id, { placeId })
    }
    const currentPlaceId = kinds.length === 0 ? undefined : byKind.get(kinds[0]!)
    if (currentPlaceId !== undefined) {
      const memberships = await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
      for (const membership of memberships) {
        if (membership.currentPlaceId === undefined) await ctx.db.patch(membership._id, { currentPlaceId })
      }
    }
    return null
  },
})

export async function readInventory(ctx: ReadCtx, args: { householdId: Id<'households'>; textileIds?: Id<'textiles'>[]; activeOnly?: boolean; readyWearer?: Id<'wearers'> | null }) {
    const { actor, membership } = await authorize(ctx, 'textile.read', { householdId: args.householdId })
    const busy = args.textileIds?.length === 0 ? new Map<Id<'textiles'>, Id<'sessions'>>() : await busyTextiles(ctx, args.householdId)
    const [household, wearers, textiles, supplies, rules, machines] = await Promise.all([
      ctx.db.get(args.householdId),
      ctx.db.query('wearers').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect().then((rows) => visible(ctx, actor, rows)),
      (args.textileIds === undefined
        ? args.activeOnly
          ? Promise.all((['dirty', 'hanging', 'needs_dry_clean', 'at_cleaner', 'needs_refresh'] as const).map(status => ctx.db.query('textiles').withIndex('by_household_status', q => q.eq('householdId', args.householdId).eq('status', status)).collect()))
            .then(async groups => [...new Map([...groups.flat(), ...(await Promise.all([...busy.keys()].map(id => ctx.db.get(id)))).filter((piece): piece is Doc<'textiles'> => piece !== null)].map(piece => [piece._id, piece])).values()])
          : args.readyWearer !== undefined
            ? ctx.db.query('textiles').withIndex('by_household_status', q => q.eq('householdId', args.householdId).eq('status', 'clean')).collect().then(rows => rows.filter(row => (row.wearerId ?? null) === args.readyWearer && !busy.has(row._id)))
            : ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
        : Promise.all(args.textileIds.map((id) => ctx.db.get(id))).then((rows) => rows.filter((row): row is Doc<'textiles'> => row !== null)))
        .then((rows) => {
          if (rows.some((row) => row.householdId !== args.householdId)) fail('forbidden', 'Forbidden')
          return visible(ctx, actor, rows.filter((row) => row.trashedAt === undefined))
        }),
      ctx.db.query('supplies').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect(),
      ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect(),
      ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect(),
    ])
    const careRows = await Promise.all(textiles.map((textile) =>
      ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()))
    const privacyEditable = await Promise.all(textiles.map((textile) => ownsCloset(ctx, actor.key, membership.role, textile)))
    return {
      planning: household?.planning ?? {},
      wearers: wearers.map((wearer) => ({
        wearerId: wearer._id,
        name: wearer.name,
        kind: wearer.kind,
        principalKey: wearer.principalKey ?? null,
        ...(wearer.requirements === undefined ? {} : { requirements: wearer.requirements }),
      })),
      textiles: textiles.map((textile, index) => {
        const care = careRows[index] ?? null
        const drying = care === null ? null : recordedDryMethod(care)
        return {
          textileId: textile._id,
          ...(textile.private === undefined ? {} : { private: textile.private }),
          ...(privacyEditable[index] ? { canChangePrivacy: true } : {}),
          ...(textile.personalRoutine === undefined ? {} : { personalRoutine: { ...textile.personalRoutine, current: routineCurrent(textile.personalRoutine, care) } }),
          ...(textile.catalogBinding === undefined ? {} : { catalogBinding: textile.catalogBinding }),
          name: textile.name,
          color: textile.color ?? null,
          colorGroup: textile.colorGroup ?? null,
          bulkUnits: textile.bulkUnits ?? null,
          firstWash: textile.firstWash ?? null,
          ...(textile.dyeRun === undefined ? {} : { dyeRun: textile.dyeRun }),
          ...(textile.preOwned === undefined ? {} : { preOwned: textile.preOwned }),
          status: textile.status,
          soilLevel: textile.soilLevel ?? null,
          /** The running load this garment is in, if any; it is not waiting for a wash while it is there. */
          inLoad: busy.get(textile._id) ?? null,
          washCount: textile.washCount,
          fromFixture: textile.fixtureKey !== undefined,
          kind: textile.kind ?? null,
          ...(textile.decoration === undefined ? {} : { decoration: textile.decoration }),
          ...(textile.adviceReminder === undefined ? {} : { adviceReminder: textile.adviceReminder }),
          wearerId: textile.wearerId ?? null,
          /** Explicit legacy labels; type does not imply tags. */
          occasions: textile.occasions ?? null,
          ...(textile.tags === undefined ? {} : { tags: textile.tags }),
          flag: textile.flag ?? null,
          ...(textile.knownStain === undefined ? {} : { knownStain: textile.knownStain }),
          ...(textile.stainCheck === undefined ? {} : { stainCheck: textile.stainCheck }),
          statusSince: textile.statusSince ?? textile.createdAt,
          lastWornAt: textile.lastWornAt ?? null,
          wearsSinceClean: textile.wearsSinceClean ?? 0,
          lastCleanedAt: textile.lastCleanedAt ?? null,
          cleanerNote: textile.cleanerNote ?? null,
          cleanerPickupBy: textile.cleanerPickupBy ?? null,
          identity: textile.identity ?? null,
          guest: textile.guest === true,
          createdAt: textile.createdAt,
          care: care === null ? null : {
            material: care.material ?? null,
            ...(care.fabricDetails === undefined ? {} : { fabricDetails: care.fabricDetails }),
            washMethod: care.washMethod ?? 'unknown',
            cycle: care.cycle ?? null,
            maxTemperatureC: care.maxTemperatureC ?? null,
            restrictions: care.restrictions,
            ...(care.instructions === undefined ? {} : { instructions: care.instructions }),
            dryMethod: drying?.method ?? 'unknown',
            /** Read from an older "Do not tumble dry" restriction rather than recorded as a method. */
            dryMethodInferred: drying?.inferred ?? false,
            dryHeat: care.dryHeat ?? null,
            ironSteam: care.ironSteam ?? null,
            ...(care.ironHeat === undefined ? {} : { ironHeat: care.ironHeat }),
            ...(care.steamPermission === undefined ? {} : { steamPermission: care.steamPermission }),
            /** The bleach triangle; absent when the tag doesn't say. */
            ...(care.bleach === undefined ? {} : { bleach: care.bleach }),
            status: materialCareProblem(care.material, care) === null ? care.status : 'needs_confirmation' as const,
            provenance: care.provenance,
          },
        }
      }),
      supplies: supplies.map((supply) => ({
        supplyId: supply._id,
        ...(supply.catalogBinding === undefined ? {} : { catalogBinding: supply.catalogBinding }),
        name: supply.name,
        kind: supply.kind,
        use: supply.use ?? null,
        formulation: typeof supply.formulation === 'string' ? { name: supply.formulation } : supply.formulation ?? null,
        measure: supply.measure ?? null,
        archived: supply.archived === true,
        ranOutAt: supply.ranOutAt ?? null,
        provenance: supply.provenance,
        ...(supply.safety === undefined ? {} : { safety: supply.safety }),
        rules: rules.filter((rule) => rule.supplyId === supply._id).map((rule) => ({
          ruleId: rule._id,
          row: rule.row ?? null,
          rowText: rule.rowText ?? null,
          dose: rule.dose,
          stage: rule.stage,
          placement: rule.placement,
          timing: rule.timing,
          conditions: rule.conditions,
          provenance: rule.provenance,
          incompatibleSupplyIds: rule.incompatibleSupplyIds,
          incompatibleMaterials: rule.incompatibleMaterials,
          sharedCompartmentCompatible: rule.sharedCompartmentCompatible,
          maximumTemperatureC: rule.maximumTemperatureC,
          stainChemistry: rule.stainChemistry,
          stainKinds: rule.stainKinds,
          safeMaterials: rule.safeMaterials,
          maximumPH: rule.maximumPH,
        })),
      })),
      machines: machines.map((machine) => ({
        machineId: machine._id,
        ...(machine.catalogBinding === undefined ? {} : { catalogBinding: machine.catalogBinding }),
        name: machine.name,
        model: machine.model ?? null,
        applianceType: machine.applianceType ?? null,
        highEfficiency: machine.highEfficiency ?? null,
        heatSettings: documentedHeatSettings(machine.model, machine.heatSettings ?? []),
        capacityUnits: machine.capacityUnits ?? null,
        capacityConfidence: machine.capacityConfidence ?? 'unknown',
        supportedCycles: machine.supportedCycles ?? [],
        placements: machinePlacements(machine.dispensingProfile),
        cycleMinutes: machine.cycleProfile?.cycles ?? {},
        ...(machine.rinseContact === undefined ? {} : { rinseContact: machine.rinseContact }),
        ...(machine.washProcesses === undefined ? {} : { washProcesses: machine.washProcesses }),
        availability: machine.pool,
        location: machine.location ?? null,
        pricePerStart: machine.pricePerStart ?? null,
        blockMinutes: machine.blockMinutes ?? null,
        drumVolume: machine.drumVolume ?? null,
        archived: machine.archived === true,
        provenance: machine.provenance,
      })),
    }
}

/** Legacy full read is retained for fixtures; connected pages request only their needed records. */
export const list = query({
  args: { householdId: v.id('households'), textileIds: v.optional(v.array(v.id('textiles'))), activeOnly: v.optional(v.boolean()), readyWearer: v.optional(v.union(v.id('wearers'), v.null())) },
  handler: readInventory,
})

// ---- Textiles and care -----------------------------------------------------

export const setPrivacy = mutation({
  args: { textileIds: v.array(v.id('textiles')), private: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.textileIds)]
    if (ids.length === 0 || ids.length > 200) fail('invalid', 'Change between 1 and 200 garments at a time')
    const textiles = await Promise.all(ids.map(async (textileId) => (await authorize(ctx, 'textile.privacy', { textileId })).textile))
    if (textiles.some((textile) => textile.householdId !== textiles[0]!.householdId)) fail('forbidden', 'Forbidden')
    for (const textile of textiles) await ctx.db.patch(textile._id, { private: args.private })
    return null
  },
})

const textileArgs = {
  color: v.optional(v.string()),
  colorGroup: v.optional(colorGroup),
  bulkUnits: v.optional(v.number()),
  firstWash: v.optional(v.boolean()),
  dyeRun: v.optional(dyeRun),
}

/** What the Add clothes sheet records beyond the older wardrobe fields. */
const garmentArgs = {
  kind: v.optional(garmentKind),
  occasions: v.optional(v.array(occasion)),
  tags: v.optional(v.array(v.string())),
  identity: v.optional(textileIdentity),
}







/** A wearer of this household; anything else is refused as if it were not there. */
async function householdWearer(ctx: ReadCtx, householdId: Id<'households'>, wearerId: Id<'wearers'>): Promise<Doc<'wearers'>> {
  const wearer = await ctx.db.get(wearerId)
  if (wearer === null || wearer.householdId !== householdId) fail('forbidden', 'Forbidden')
  return wearer
}

/** The caller's wardrobe collection in the household, made the first time they add a garment. */
export async function wardrobeFor(ctx: MutationCtx, householdId: Id<'households'>, principalKey: string): Promise<Id<'collections'>> {
  const collections = await ctx.db.query('collections').withIndex('by_owner', (q) => q.eq('ownerPrincipalKey', principalKey)).collect()
  const wardrobe = collections.find((collection) => collection.householdId === householdId && collection.name === 'Wardrobe')
  return wardrobe?._id ?? await ctx.db.insert('collections', { householdId, ownerPrincipalKey: principalKey, name: 'Wardrobe', createdAt: Date.now() })
}


function checkedFabricDetails(value: FabricDetails | undefined, material: string | undefined): FabricDetails | undefined {
  try {
    const details = normalizeFabricDetails(value)
    const fibers = (material ?? '').split(/[,/;]\s*/u).map((part) => part.replace(/^\d+(?:\.\d+)?%\s*/u, '').trim().toLowerCase()).map((name) => namedFiber(name)?.fiber ?? name)
    if (details?.fibers?.some((entry) => !fibers.includes(entry.fiber))) fail('invalid', 'Fabric details must belong to a recorded fiber')
    return details
  } catch (caught) { fail('invalid', caught instanceof Error ? caught.message : 'Invalid fabric details') }
}

function retainedFabricDetails(value: FabricDetails | undefined, material: string | undefined): FabricDetails | undefined {
  const fibers = (material ?? '').split(/[,/;]\s*/u).map((part) => part.replace(/^\d+(?:\.\d+)?%\s*/u, '').trim().toLowerCase()).map((name) => namedFiber(name)?.fiber ?? name)
  return value === undefined ? undefined : normalizeFabricDetails({ ...value, fibers: value.fibers?.filter((entry) => fibers.includes(entry.fiber)) })
}

/**
 * Validates and stores a garment's care, replacing what was recorded. Incomplete or unconfirmed care
 * stays visible as needing confirmation. With `keepRecorded`, drying, iron and bleach answers the caller left
 * out are kept as recorded, so an older client cannot erase them. Callers invalidate plans.
 */
export async function writeCare(ctx: MutationCtx, textile: Doc<'textiles'>, care: CareFields, evidence: Provenance, keepRecorded = false): Promise<Doc<'care'>['status']> {
  const checked = provenance(evidence)
  if (care.restrictions.length > 20) fail('invalid', 'Too many care restrictions')
  const restrictions = care.restrictions.map((restriction) => text(restriction, 'Care restriction', 120))
  const cycle = care.cycle === undefined || care.cycle.trim() === '' ? undefined : cycleName(care.cycle)
  const maxTemperatureC = care.maxTemperatureC === undefined ? undefined : positive(care.maxTemperatureC, 'Maximum temperature', 95)
  const complete = care.washMethod !== 'unknown' && (care.washMethod !== 'machine' || cycle !== undefined)
  const existing = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
  const kept = keepRecorded ? existing : null
  const method = care.dryMethod ?? kept?.dryMethod
  const heat = care.dryMethod === undefined ? care.dryHeat ?? kept?.dryHeat : care.dryHeat
  const iron = care.ironSteam ?? kept?.ironSteam
  const ironHeat = care.ironSteam === undefined ? care.ironHeat ?? kept?.ironHeat : care.ironHeat
  const steamPermission = care.steamPermission ?? kept?.steamPermission
  if (ironHeat !== undefined && iron !== 'allowed') fail('invalid', 'Iron heat requires an allowed iron instruction')
  const triangle = care.bleach ?? kept?.bleach
  const material = optionalText(care.material, 'Material', 240)
  const fabricDetails = care.fabricDetails === undefined ? retainedFabricDetails(existing?.fabricDetails, material) : checkedFabricDetails(care.fabricDetails, material)
  if (care.dryHeat !== undefined && method !== 'tumble_dry') fail('invalid', 'A dryer heat goes with a tumble-dry label')
  const fields = {
    material,
    ...(fabricDetails === undefined ? {} : { fabricDetails }),
    washMethod: care.washMethod,
    cycle,
    maxTemperatureC,
    restrictions,
    ...((care.instructions ?? existing?.instructions) === undefined ? {} : { instructions: care.instructions ?? existing?.instructions }),
    ...(method === undefined || method === 'unknown' ? {} : { dryMethod: method }),
    ...(method === 'tumble_dry' && heat !== undefined ? { dryHeat: heat } : {}),
    ...(iron === undefined ? {} : { ironSteam: iron }),
    ...(ironHeat === undefined ? {} : { ironHeat }),
    ...(steamPermission === undefined ? {} : { steamPermission }),
    ...(triangle === undefined ? {} : { bleach: triangle }),
    status: complete && evidencePolicy.careConfirmed(checked.confidence) && materialCareProblem(care.material, { washMethod: care.washMethod, cycle, maxTemperatureC, bleach: triangle, dryMethod: method, dryHeat: heat, ironHeat }) === null ? 'confirmed' as const : 'needs_confirmation' as const,
    provenance: checked,
  }
  if (existing === null) {
    await ctx.db.insert('care', { householdId: textile.householdId, textileId: textile._id, ...fields, createdAt: Date.now() })
  } else {
    await ctx.db.replace(existing._id, { householdId: existing.householdId, textileId: existing.textileId, createdAt: existing.createdAt, ...fields })
  }
  return fields.status
}

/** The care-tag answers as tapped. `TagAnswers` is `answerTagQuestions`' arguments minus the garments. */
const tagAnswerFields = {
  washMethod,
  /** Optional for older callers; recorded as a label restriction, independently of temperature. */
  washWithLikeColors: v.optional(v.boolean()),
  /** Recorded numeric wash limit or the tub's dot temperature; omitted when the tag doesn't say. */
  maxTemperatureC: v.optional(v.number()),
  cycle: v.optional(v.string()),
  dryMethod: v.optional(dryMethod),
  dryHeat: v.optional(dryerHeat),
  ironSteam: v.optional(ironSteam),
  ironHeat: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
  steamPermission: v.optional(ironSteam),
  /** The bleach triangle; omitted when the tag doesn't say (only the care words, if any, restrict bleach). */
  bleach: v.optional(bleach),
}
export const tagAnswers = v.object(tagAnswerFields)
export type TagAnswers = Infer<typeof tagAnswers>



// ---- Textiles --------------------------------------------------------------

/** First-intake observation; the saved garment uses the existing stain flag/report vocabulary. */
const intakeStain = v.union(v.literal('none'), v.literal('food'), v.literal('grease'), v.literal('ink'), v.literal('other'))
type IntakeStain = Infer<typeof intakeStain>
const intakeStainFacts = {
  food: { reason: 'food', kind: 'unknown' },
  grease: { reason: 'stain_other', kind: 'oil_grease' },
  ink: { reason: 'stain_other', kind: 'dye_ink_transfer' },
  other: { reason: 'stain_other', kind: 'unknown' },
} as const

type NewTextiles = TextileFields & {
  householdId: Id<'households'>
  name: string
  soilLevel?: Doc<'textiles'>['soilLevel']
  kind?: Doc<'textiles'>['kind']
  wearerId?: Id<'wearers'>
  occasions?: Occasion[]
  tags?: string[]
  identity?: TextileIdentity
  status?: 'clean' | 'dirty'
  tag?: TagAnswers
  stain?: IntakeStain
  /** An old, set-in stain is saved as a known mark: no flag, and the garment may be added ready. */
  stainAge?: 'new' | 'set_in'
  /** The main fiber from the label. */
  material?: string
  fabricDetails?: FabricDetails
  preOwned?: Infer<typeof preOwnedValidator>
}

/**
 * New garments go in the caller's wardrobe, needing a wash unless the caller says they are ready;
 * identical ones are separate rows. Tag answers become each garment's care in the same transaction.
 */
async function insertTextiles(ctx: MutationCtx, args: NewTextiles, quantity: number): Promise<Id<'textiles'>[]> {
  const actor = (await authorize(ctx, 'textile.add', { householdId: args.householdId })).actor
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) fail('invalid', 'Add between 1 and 20 garments at a time')
  const requestedStatus = args.status ?? 'dirty'
  const stain = args.stain === undefined || args.stain === 'none' ? null : intakeStainFacts[args.stain]
  const setIn = args.stainAge === 'set_in'
  if (setIn && stain === null) fail('invalid', 'Choose the stain before saying it’s old and set in')
  if (stain !== null && !setIn && requestedStatus === 'clean') fail('invalid', 'Stained garments must be added to the hamper')
  if (requestedStatus === 'clean' && args.soilLevel !== undefined) fail('invalid', 'Only a garment that needs a wash has a soil level')
  if (args.wearerId !== undefined) await householdWearer(ctx, args.householdId, args.wearerId)
  const care = args.tag === undefined ? null : tagCare(args.tag)
  // A kill threshold never overrides a tag: heat treatment needs a tag that allows high heat.
  if (args.preOwned?.heatTreat === true && !tagAllowsHighHeat(care as CareEvidence | null)) fail('invalid', 'Heat treatment needs a care label that allows high heat')
  const status = requestedStatus === 'dirty' && care?.washMethod === 'dry_clean_only' ? 'needs_dry_clean' : requestedStatus
  const identity = args.identity === undefined ? undefined : identityFrom(args.identity)
  const collectionId = await wardrobeFor(ctx, args.householdId, actor.key)
  const fields = {
    // Dye is unknown until one wash proves it, so a pre-owned piece records no first-wash answer.
    ...textileFields(args.preOwned === undefined ? args : { ...args, firstWash: undefined, dyeRun: 'unknown' }),
    ...(args.preOwned === undefined ? {} : { preOwned: args.preOwned }),
    name: text(args.name, 'Name'),
    ...(args.kind === undefined ? {} : { kind: args.kind }),
    ...(args.wearerId === undefined ? {} : { wearerId: args.wearerId }),
    ...(args.occasions === undefined ? {} : { occasions: occasionsFrom(args.occasions) }),
    ...(args.tags === undefined ? {} : { tags: tagsFrom(args.tags) }),
    ...(identity === undefined ? {} : { identity }),
  }
  const textileIds: Id<'textiles'>[] = []
  const now = Date.now()
  for (let copy = 0; copy < quantity; copy += 1) {
    const textileId = await ctx.db.insert('textiles', {
      householdId: args.householdId,
      collectionId,
      ownerPrincipalKey: actor.key,
      ...fields,
      status,
      ...(stain === null ? {} : setIn ? { knownStain: { reason: stain.reason, kind: stain.kind, recordedAt: now } } : { flag: { reasons: [stain.reason], stainReport: { kind: stain.kind, priorTreatmentAttempts: 'unknown' as const }, flaggedBy: actor.key, flaggedAt: now } }),
      ...(status !== 'dirty' || args.soilLevel === undefined ? {} : { soilLevel: args.soilLevel }),
      washCount: 0,
      statusSince: now,
      createdAt: now,
    })
    if (care !== null || args.material !== undefined || args.fabricDetails !== undefined) await writeCare(ctx, (await ctx.db.get(textileId))!, { ...(care ?? { washMethod: 'unknown', restrictions: [] }), ...(args.material === undefined ? {} : { material: args.material }), ...(args.fabricDetails === undefined ? {} : { fabricDetails: args.fabricDetails }) }, tagEvidence)
    textileIds.push(textileId)
  }
  await invalidatePlans(ctx, args.householdId)
  return textileIds
}

export const createTextile = mutation({
  args: { householdId: v.id('households'), name: v.string(), soilLevel: v.optional(soilLevel), ...textileArgs },
  returns: v.id('textiles'),
  handler: async (ctx, args) => (await insertTextiles(ctx, args, 1))[0]!,
})

/**
 * Adds several identical garments at once, such as four of the same tee. `status` stays `dirty` by
 * default for older callers; Add clothes passes `clean` and Add to hamper passes `dirty`.
 */
export const createTextiles = mutation({
  args: {
    intakeKey: v.optional(v.string()),
    householdId: v.id('households'),
    name: v.string(),
    quantity: v.number(),
    soilLevel: v.optional(soilLevel),
    status: v.optional(v.union(v.literal('clean'), v.literal('dirty'))),
    wearerId: v.optional(v.id('wearers')),
    tag: v.optional(tagAnswers),
    stain: v.optional(intakeStain),
    stainAge: v.optional(v.union(v.literal('new'), v.literal('set_in'))),
    material: v.optional(v.string()),
    fabricDetails: v.optional(fabricDetailsValidator),
    colors: v.optional(v.array(v.object({ name: v.string(), color: v.string(), colorGroup, quantity: v.number(), dyeRun: v.optional(dyeRun) }))),
    sameCareInstructions: v.optional(v.boolean()),
    preOwned: v.optional(preOwnedValidator),
    ...textileArgs,
    ...garmentArgs,
  },
  returns: v.array(v.id('textiles')),
  handler: async (ctx, { intakeKey, ...args }) => {
    const actor = (await authorize(ctx, 'textile.add', { householdId: args.householdId })).actor
    const save = await intakeSave(ctx, args.householdId, actor.key, 'garment', intakeKey, args)
    if (save?.previous) return save.previous.result as Id<'textiles'>[]
    if (args.colors === undefined) {
      const ids = await insertTextiles(ctx, args, args.quantity)
      await save?.record(ids)
      return ids
    }
    if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 20 || args.colors.length < 2 || args.colors.length > 20 || args.colors.reduce((total, color) => total + color.quantity, 0) !== args.quantity) fail('invalid', 'Color quantities must total between 1 and 20 pieces')
    if (args.sameCareInstructions !== true) fail('invalid', 'Check that the care instructions apply to every piece')
    for (const color of args.colors) {
      if (!Number.isInteger(color.quantity) || color.quantity < 1) fail('invalid', 'Each color needs at least one piece')
      text(color.name, 'Name'); text(color.color, 'Color', 60)
    }
    const textileIds: Id<'textiles'>[] = []
    for (const color of args.colors) {
      const dye = color.dyeRun ?? 'unknown'
      textileIds.push(...await insertTextiles(ctx, { ...args, ...color, dyeRun: dye, firstWash: dye === 'new' ? true : dye === 'fast' ? false : undefined }, color.quantity))
    }
    await save?.record(textileIds)
    return textileIds
  },
})

/** Newly bought matching pieces start Ready with their own wash history and first-wash protection. */
export const addMatchingTextiles = mutation({
  args: { textileId: v.id('textiles'), quantity: v.number() },
  returns: v.array(v.id('textiles')),
  handler: async (ctx, args) => {
    const { textile: source, actor } = await authorize(ctx, 'textile.add', { textileId: args.textileId })
    if (source.guest === true) fail('invalid', 'Guest laundry cannot be added to the closet')
    if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 20) fail('invalid', 'Add between 1 and 20 garments at a time')
    const collectionId = await wardrobeFor(ctx, source.householdId, actor.key)
    const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', source._id)).unique()
    const added: Id<'textiles'>[] = []
    for (let index = 0; index < args.quantity; index += 1) {
      const now = Date.now()
      const textileId = await ctx.db.insert('textiles', {
        householdId: source.householdId,
        collectionId,
        ownerPrincipalKey: actor.key,
        name: source.name,
        ...(source.private === undefined ? {} : { private: source.private }),
        ...(source.color === undefined ? {} : { color: source.color }),
        ...(source.colorGroup === undefined ? {} : { colorGroup: source.colorGroup }),
        ...(source.bulkUnits === undefined ? {} : { bulkUnits: source.bulkUnits }),
        ...(source.kind === undefined ? {} : { kind: source.kind }),
        ...(source.wearerId === undefined ? {} : { wearerId: source.wearerId }),
        ...(source.occasions === undefined ? {} : { occasions: source.occasions }),
        ...(source.tags === undefined ? {} : { tags: source.tags }),
        ...(source.identity === undefined ? {} : { identity: source.identity }),
        firstWash: true,
        dyeRun: 'new',
        status: 'clean',
        washCount: 0,
        statusSince: now,
        createdAt: now,
      })
      if (care !== null) await writeCare(ctx, (await ctx.db.get(textileId))!, { ...care, washMethod: care.washMethod ?? 'unknown' }, care.provenance)
      added.push(textileId)
    }
    await invalidatePlans(ctx, source.householdId)
    return added
  },
})


/** Bulk organization never rewrites care or fabric and either changes every authorized piece or none. */
export const bulkUpdateTextiles = mutation({
  args: { textileIds: v.array(v.id('textiles')), addTags: v.optional(v.array(v.string())), wearerId: v.optional(v.union(v.id('wearers'), v.null())) },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.textileIds)]
    if (ids.length === 0 || ids.length > 200 || args.addTags === undefined && args.wearerId === undefined) fail('invalid', 'Choose between 1 and 200 pieces and a change')
    const rows = await Promise.all(ids.map(async (textileId) => (await authorize(ctx, 'textile.edit', { textileId })).textile))
    const householdId = rows[0]!.householdId
    if (rows.some((row) => row.householdId !== householdId || row.trashedAt !== undefined || row.guest)) fail('forbidden', 'Forbidden')
    if (args.wearerId !== undefined) {
      if (args.wearerId !== null) await householdWearer(ctx, householdId, args.wearerId)
      const busy = await busyTextiles(ctx, householdId)
      if (rows.some((row) => busy.has(row._id))) fail('conflict', 'Finish the running load before changing who these pieces belong to')
    }
    const patches = rows.map((row) => ({
      ...(args.addTags === undefined ? {} : { tags: tagsFrom([...clothingTags(row), ...args.addTags]) }),
      ...(args.wearerId === undefined ? {} : { wearerId: args.wearerId ?? undefined }),
    }))
    for (let index = 0; index < rows.length; index++) await ctx.db.patch(rows[index]!._id, patches[index]!)
    if (args.wearerId !== undefined) await invalidatePlans(ctx, householdId)
    return { changed: rows.length }
  },
})

export const updateTextile = mutation({
  args: {
    textileId: v.id('textiles'),
    name: v.optional(v.string()),
    status: v.optional(v.union(v.literal('dirty'), v.literal('clean'))),
    soilLevel: v.optional(v.union(soilLevel, v.null())),
    /** `null` makes the garment shared (towels, sheets). */
    wearerId: v.optional(v.union(v.id('wearers'), v.null())),
    ...textileArgs,
    ...garmentArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'textile.edit', { textileId: args.textileId })).textile
    if (args.wearerId !== undefined && args.wearerId !== null) await householdWearer(ctx, textile.householdId, args.wearerId)
    // The kind and the wearer reach the planner (about-bulk, baby clothes), like the older fields.
    const planned = {
      ...textileFields(args),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.wearerId === undefined ? {} : { wearerId: args.wearerId ?? undefined }),
    }
    const identity = args.identity === undefined ? textile.identity : identityFrom(args.identity)
    const identityChanged = args.identity !== undefined && (['brand', 'styleNumber', 'size', 'rnNumber', 'barcode'] as const)
      .some((field) => textile.identity?.[field] !== identity?.[field])
    const colorChanged = args.color !== undefined && planned.color !== textile.color
    const decorationInvalidated = (identityChanged || colorChanged) && textile.decoration !== undefined
    const actor = decorationInvalidated ? await principalFromAuth(ctx.auth) : null
    const described = {
      ...(args.occasions === undefined ? {} : { occasions: occasionsFrom(args.occasions) }),
      ...(args.tags === undefined ? {} : { tags: tagsFrom(args.tags) }),
      ...(args.identity === undefined ? {} : { identity }),
      // A candidate is optional; changing identity/color leaves it unmatched rather than guessing a new SKU.
      ...(identityChanged || colorChanged ? { catalogCandidate: undefined, catalogBinding: undefined } : {}),
      ...(decorationInvalidated ? { decoration: { kind: 'unknown' as const, method: 'unknown' as const, manufacturer: '', source: '', confidence: 'unknown' as const, revision: textile.decoration!.revision + 1, recordedAt: Date.now(), recordedBy: actor!.key } } : {}),
    }
    const soil = nextSoil(textile, args.status ?? textile.status, args.soilLevel)
    const moved = args.status !== undefined && args.status !== textile.status
    await ctx.db.patch(textile._id, { ...planned, ...described, ...(moved ? { status: args.status, statusSince: Date.now() } : {}), soilLevel: soil })
    // Dirty/clean state is selection state, not planner evidence; how dirty a garment is doses its load.
    if (Object.keys(planned).length > 0 || soil !== textile.soilLevel || decorationInvalidated) await invalidatePlans(ctx, textile.householdId)
    return null
  },
})

/**
 * Marks many garments dirty or clean at once, with how dirty they are when they need a wash.
 * Garments in a running load are left as they are rather than refusing the rest.
 */
export const setTextileStatus = mutation({
  args: {
    textileIds: v.array(v.id('textiles')),
    status: v.union(v.literal('dirty'), v.literal('clean')),
    soilLevel: v.optional(soilLevel),
  },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const textileIds = [...new Set(args.textileIds)]
    if (textileIds.length === 0 || textileIds.length > 200) fail('invalid', 'Change between 1 and 200 garments at a time')
    const textiles = await Promise.all(textileIds.map(async (textileId) => {
      const textile = await ctx.db.get(textileId)
      if (textile === null) fail('not_found', 'Not found')
      return textile
    }))
    const householdId = textiles[0]!.householdId
    await authorize(ctx, 'textile.edit', { householdId: householdId, uses: { textileIds } })
    if (textiles.some((textile) => textile.householdId !== householdId)) fail('forbidden', 'Forbidden')
    const busy = await busyTextiles(ctx, householdId)
    let changed = 0
    let soilChanged = false
    for (const textile of textiles) {
      if (busy.has(textile._id)) continue
      const soil = nextSoil(textile, args.status, args.soilLevel)
      if (textile.status === args.status && soil === textile.soilLevel) continue
      await ctx.db.patch(textile._id, { status: args.status, soilLevel: soil })
      changed += 1
      soilChanged ||= soil !== textile.soilLevel
    }
    if (soilChanged) await invalidatePlans(ctx, householdId)
    return { changed }
  },
})

/**
 * Records care evidence. Incomplete or unconfirmed care stays visible as needing confirmation.
 * Drying care omitted by a caller is kept as recorded, so an older client cannot erase it.
 */
export const setCare = mutation({
  args: {
    textileId: v.id('textiles'),
    material: v.optional(v.string()),
    washMethod,
    cycle: v.optional(v.string()),
    maxTemperatureC: v.optional(v.number()),
    restrictions: v.array(v.string()),
    dryMethod: v.optional(dryMethod),
    /** The hottest heat a tumble-dry label allows; omitted with `tumble_dry` means any heat. */
    dryHeat: v.optional(dryerHeat),
    provenance: provenanceValidator,
  },
  returns: v.object({ status: v.union(v.literal('confirmed'), v.literal('needs_confirmation')) }),
  handler: async (ctx, args) => {
    const { textileId, provenance: evidence, ...care } = args
    const textile = (await authorize(ctx, 'textile.edit', { textileId: textileId })).textile
    const status = await writeCare(ctx, textile, care, evidence, true)
    await invalidatePlans(ctx, textile.householdId)
    return { status }
  },
})

/** One physical piece's additional label wording. Symbol edits cannot erase it. */
export const setCareInstructions = mutation({
  args: { textileId: v.id('textiles'), instructions: v.union(careInstructions, v.null()), expectedInstructions: v.union(careInstructions, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'textile.edit', { textileId: args.textileId })).textile
    if ((await busyTextiles(ctx, textile.householdId)).has(textile._id)) fail('conflict', 'Wait until this piece’s active load is finished before changing its label')
    const drying = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', textile.householdId)).collect()
    if (drying.some((piece) => piece.textileId === textile._id && piece.status !== 'queued')) fail('conflict', 'Put this piece away before changing its label wording')
    const recorded = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
    if (recorded === null) fail('invalid', 'Record the label’s washing answer first')
    if (careInstructionKey(recorded.instructions ?? null) !== careInstructionKey(args.expectedInstructions)) fail('conflict', 'The label wording changed. Reopen it before saving again.')
    let instructions: CareInstructions | undefined
    if (args.instructions !== null) {
      const input = args.instructions
      const lines = (values: string[], label: string) => {
        if (values.length > 10) fail('invalid', 'Keep each category to ten label instructions')
        return [...new Set(values.map((value) => text(value, label, 240)))]
      }
      const professional = (value: CareInstructions['professionalDry']) => value === undefined ? undefined : { ...value, wording: text(value.wording, 'Professional care wording', 500) }
      instructions = { ...input, source: text(input.source, 'Label source', 240),
        symbolSystem: optionalText(input.symbolSystem, 'Symbol system', 120),
        preparation: lines(input.preparation, 'Preparation instruction'), washing: lines(input.washing, 'Washing requirement'),
        beforeDrying: lines(input.beforeDrying, 'Drying preparation'), drying: lines(input.drying, 'Drying requirement'),
        afterDrying: lines(input.afterDrying, 'Drying completion'), ironing: lines(input.ironing, 'Ironing instruction'),
        professionalDry: professional(input.professionalDry), professionalWet: professional(input.professionalWet),
        maximumSoakMinutes: input.maximumSoakMinutes,
      }
      if (input.maximumSoakMinutes !== undefined && (!Number.isFinite(input.maximumSoakMinutes) || input.maximumSoakMinutes < 0 || input.maximumSoakMinutes > 1440)) fail('invalid', 'Maximum soaking time must be between 0 and 1440 minutes')
      for (const [stage, key, allowed] of [['washing', 'washingRequirements', washRequirementKinds], ['drying', 'dryingRequirements', dryRequirementKinds]] as const) {
        const bindings = instructions[key]
        if (bindings === undefined) continue
        if (bindings.length > 10 || new Set(bindings.map((entry) => entry.wording)).size !== bindings.length) fail('invalid', 'Interpret each source line once')
        for (const binding of bindings) {
          if (!instructions[stage].includes(binding.wording)) fail('invalid', 'A process requirement must match a current source line exactly')
          if (binding.requirements.length === 0 || binding.requirements.length > 10 || binding.requirements.some((entry) => !(allowed as readonly string[]).includes(entry.kind) || careRequirementProblem(entry) !== null)) fail('invalid', 'Keep unsupported or conditional wording unresolved; record only exact supported requirements')
        }
      }
      if (new TextEncoder().encode(JSON.stringify(instructions)).byteLength > 2000) fail('invalid', 'Keep this label record within 2000 bytes; retain longer source material in its care photo or reference')
    }
    await ctx.db.patch(recorded._id, { instructions })
    await invalidatePlans(ctx, textile.householdId)
    return null
  },
})

/**
 * Stores the care-tag answers for one or more garments (the Add clothes tag step and the unknown-care
 * card), replacing what was recorded. Answers the tag doesn't give stay unknown and fail closed.
 */
export const answerTagQuestions = mutation({
  args: { textileIds: v.array(v.id('textiles')), ...tagAnswerFields, material: v.optional(v.union(v.string(), v.null())), fabricDetails: v.optional(fabricDetailsValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { textileIds, material, fabricDetails, ...tag } = args
    const unique = [...new Set(textileIds)]
    if (unique.length === 0 || unique.length > 200) fail('invalid', 'Change between 1 and 200 garments at a time')
    const care = tagCare(tag)
    const textiles = await Promise.all(unique.map(async (textileId) => (await authorize(ctx, 'textile.edit', { textileId: textileId })).textile))
    const householdId = textiles[0]!.householdId
    if (textiles.some((textile) => textile.householdId !== householdId)) fail('forbidden', 'Forbidden')
    for (const textile of textiles) {
      const recorded = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
      // Symbol questions keep recorded wording such as "do not soak"; material changes only when sent (null clears it).
      const restrictions = tag.washWithLikeColors === undefined ? recorded?.restrictions ?? []
        : [...(recorded?.restrictions ?? []).filter((wording) => wording !== 'Wash with like colors'), ...care.restrictions]
      await writeCare(ctx, textile, { ...care, material: material === undefined ? recorded?.material : material ?? undefined, ...(fabricDetails === undefined ? {} : { fabricDetails }), restrictions }, tagEvidence)
    }
    await invalidatePlans(ctx, householdId)
    return null
  },
})

/**
 * "Fabric" by itself: the material changes and every recorded care answer is kept, including care the tag
 * questions cannot show. A garment with no care record gets one holding only the fabric; its label still
 * needs checking. `null` clears the fabric.
 */
export const setMaterial = mutation({
  args: { textileIds: v.array(v.id('textiles')), material: v.union(v.string(), v.null()), fabricDetails: v.optional(fabricDetailsValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unique = [...new Set(args.textileIds)]
    if (unique.length === 0 || unique.length > 200) fail('invalid', 'Change between 1 and 200 garments at a time')
    const textiles = await Promise.all(unique.map(async (textileId) => (await authorize(ctx, 'textile.edit', { textileId: textileId })).textile))
    const householdId = textiles[0]!.householdId
    if (textiles.some((textile) => textile.householdId !== householdId)) fail('forbidden', 'Forbidden')
    const material = args.material === null ? undefined : optionalText(args.material, 'Material', 240)
    for (const textile of textiles) {
      const recorded = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
      const fabricDetails = args.fabricDetails === undefined ? retainedFabricDetails(recorded?.fabricDetails, material) : checkedFabricDetails(args.fabricDetails, material)
      if (recorded !== null) await ctx.db.patch(recorded._id, { material, fabricDetails, ...(materialCareProblem(material, recorded) === null ? {} : { status: 'needs_confirmation' as const }) })
      else if (material !== undefined || fabricDetails !== undefined) await writeCare(ctx, textile, { material, fabricDetails, washMethod: 'unknown', restrictions: [] }, tagEvidence)
    }
    await invalidatePlans(ctx, householdId)
    return null
  },
})

const trashDays = 30
const trashWindowMs = trashDays * 24 * 60 * 60 * 1000

/** Recoverable garments are kept out of Closet and Laundry for 30 days. */
export const listTrash = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'textile.read', { householdId: args.householdId })
    const now = Date.now()
    const rows = await visible(ctx, actor, await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect())
    return rows.filter((row) => row.trashedAt !== undefined && row.trashedAt + trashWindowMs > now)
      .sort((left, right) => right.trashedAt! - left.trashedAt!)
      .map((row) => ({ textileId: row._id, name: row.name, color: row.color ?? null, deleteAt: row.trashedAt! + trashWindowMs }))
  },
})

export const trashTextiles = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: v.object({ changed: v.number(), trashedAt: v.optional(v.number()), revisions: v.optional(v.array(v.object({ textileId: v.id('textiles'), revision: v.number() }))) }),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.textileIds)]
    if (ids.length === 0 || ids.length > 200) fail('invalid', 'Remove between 1 and 200 matching pieces at a time')
    const rows = await Promise.all(ids.map(async (id) => (await authorize(ctx, 'textile.trash', { textileId: id })).textile))
    const householdId = rows[0]!.householdId
    if (rows.some((row) => row.householdId !== householdId)) fail('forbidden', 'Forbidden')
    if (rows.some((row) => row.guest === true || row.status === 'hanging' || row.status === 'at_cleaner')) fail('conflict', 'Finish care before removing these pieces')
    const busy = await busyTextiles(ctx, householdId)
    if (rows.some((row) => busy.has(row._id))) fail('conflict', 'A piece is in a running load')
    const trashedAt = Date.now()
    const revisions: { textileId: Id<'textiles'>; revision: number }[] = []
    for (const row of rows) {
      const revision = (row.trashRevision ?? 0) + 1
      revisions.push({ textileId: row._id, revision })
      await ctx.db.patch(row._id, { trashedAt, trashRevision: revision })
      await ctx.scheduler.runAfter(trashWindowMs, internal.inventory.purgeTrashed, { textileId: row._id, trashedAt, revision })
    }
    await invalidatePlans(ctx, householdId)
    return { changed: rows.length, trashedAt, revisions }
  },
})

export const restoreTextiles = mutation({
  args: { textileIds: v.array(v.id('textiles')), expectedTrashedAt: v.optional(v.number()), expectedRevisions: v.optional(v.array(v.object({ textileId: v.id('textiles'), revision: v.number() }))) },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.textileIds)]
    if (ids.length === 0 || ids.length > 200) fail('invalid', 'Restore between 1 and 200 pieces at a time')
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)))
    const householdId = rows[0]?.householdId
    if (householdId === undefined) fail('not_found', 'Not found')
    await authorize(ctx, 'textile.trash', { householdId: householdId, uses: { textileIds: ids } })
    if (rows.some((row) => row === null || row.householdId !== householdId)) fail('forbidden', 'Forbidden')
    const now = Date.now()
    const restorable = rows as Doc<'textiles'>[]
    if (args.expectedTrashedAt !== undefined) {
      if (!Number.isFinite(args.expectedTrashedAt) || args.expectedTrashedAt > now || now - args.expectedTrashedAt > 60_000) fail('conflict', 'Undo expired. Restore these pieces from Trash')
      if (restorable.some((row) => row.trashedAt !== args.expectedTrashedAt)) fail('conflict', 'These pieces changed after removal. Check Trash before restoring them')
      if (args.expectedRevisions === undefined || args.expectedRevisions.length !== restorable.length || restorable.some((row) => args.expectedRevisions!.find((entry) => entry.textileId === row._id)?.revision !== row.trashRevision)) fail('conflict', 'These pieces changed after removal. Check Trash before restoring them')
    }
    if (restorable.some((row) => row.trashedAt === undefined || row.trashedAt + trashWindowMs <= now)) fail('invalid', 'These pieces are no longer in Trash')
    for (const row of restorable) await ctx.db.patch(row._id, { trashedAt: undefined })
    await invalidatePlans(ctx, householdId)
    return { changed: restorable.length }
  },
})

async function eraseTextile(ctx: MutationCtx, textile: Doc<'textiles'>): Promise<void> {
  await eraseOutcomeData(ctx, { textileId: textile._id })
  const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  const photos = await ctx.db.query('carePhotos').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  const washRecords = await ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  const history = await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  for (const photo of photos) {
    await ctx.storage.delete(photo.storageId)
    await ctx.db.delete(photo._id)
  }
  const queued = (await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', textile.householdId)).collect()).filter((piece) => piece.textileId === textile._id)
  for (const row of [...care, ...washRecords, ...history, ...queued]) await ctx.db.delete(row._id)
  await ctx.db.delete(textile._id)
}

/** Timestamp and revision keep older jobs from deleting restored and re-trashed pieces. */
export const purgeTrashed = internalMutation({
  args: { textileId: v.id('textiles'), trashedAt: v.number(), revision: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (Date.now() < args.trashedAt + trashWindowMs) return null
    const row = await ctx.db.get(args.textileId)
    if (row !== null && row.trashedAt === args.trashedAt && row.trashRevision === args.revision) await eraseTextile(ctx, row)
    return null
  },
})

/** Permanently deletes a garment and its care history. */
export const deleteTextile = mutation({
  args: { textileId: v.id('textiles') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'textile.trash', { textileId: args.textileId })).textile
    if ((await busyTextiles(ctx, textile.householdId)).has(textile._id)) fail('conflict', 'This garment is in a running load')
    await eraseTextile(ctx, textile)
    await invalidatePlans(ctx, textile.householdId)
    return null
  },
})

// ---- Wearers ---------------------------------------------------------------

/**
 * A profile's product requirements, tidied: ingredients trimmed and de-duplicated, accepted
 * products limited to this household's. Nothing about why is stored. An empty set is no requirements.
 */
async function requirementsFrom(ctx: ReadCtx, householdId: Id<'households'>, requirements: Infer<typeof wearerRequirements>): Promise<Infer<typeof wearerRequirements> | undefined> {
  const avoid = requirements.avoidIngredients === undefined ? [] : ingredientList(requirements.avoidIngredients, 'Ingredient to avoid')
  const accepted = [...new Set(requirements.acceptedSupplyIds ?? [])]
  if (accepted.length > 50) fail('invalid', 'List at most 50 accepted products')
  for (const supplyId of accepted) {
    const supply = await ctx.db.get(supplyId)
    if (supply === null || supply.householdId !== householdId) fail('invalid', 'Choose a product in this household')
  }
  const result = {
    ...(requirements.fragranceFree === true ? { fragranceFree: true } : {}),
    ...(requirements.dyeFree === true ? { dyeFree: true } : {}),
    ...(avoid.length === 0 ? {} : { avoidIngredients: avoid }),
    ...(accepted.length === 0 ? {} : { acceptedSupplyIds: accepted }),
  }
  return Object.keys(result).length === 0 ? undefined : result
}


/** Who wears the clothes: a name tag, not an account. */
export const createWearer = mutation({
  args: { householdId: v.id('households'), name: v.string(), kind: wearerKind, self: v.optional(v.boolean()), requirements: v.optional(wearerRequirements), intakeKey: v.optional(v.string()) },
  returns: v.id('wearers'),
  handler: async (ctx, { intakeKey, ...args }) => {
    const actor = (await authorize(ctx, 'people.add', { householdId: args.householdId })).actor
    const save = await intakeSave(ctx, args.householdId, actor.key, 'wearer', intakeKey, args)
    if (save?.previous) return save.previous.result as Id<'wearers'>
    if (args.self) {
      const mine = await ctx.db.query('wearers').withIndex('by_household_principal', (q) => q.eq('householdId', args.householdId).eq('principalKey', actor.key)).unique()
      if (mine !== null) fail('conflict', 'Your account already has a clothing profile')
    }
    const requirements = args.requirements === undefined ? undefined : await requirementsFrom(ctx, args.householdId, args.requirements)
    const wearerId = await ctx.db.insert('wearers', { householdId: args.householdId, name: text(args.name, 'Name', 60), kind: args.kind, createdAt: Date.now(), ...(args.self ? { principalKey: actor.key as string } : {}), ...(requirements === undefined ? {} : { requirements }) })
    if (requirements !== undefined) await invalidatePlans(ctx, args.householdId)
    await save?.record(wearerId)
    return wearerId
  },
})

/**
 * Renames a wearer, changes their kind, or links them to a signed-in member (`null` unlinks). Only
 * that member or an owner may link or unlink, and a member is linked to at most one wearer.
 */
export const updateWearer = mutation({
  args: { wearerId: v.id('wearers'), name: v.optional(v.string()), kind: v.optional(wearerKind), principalKey: v.optional(v.union(v.string(), v.null())), requirements: v.optional(wearerRequirements) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const wearer = await householdRow(ctx, 'people.edit', await ctx.db.get(args.wearerId))
    if (args.principalKey !== undefined) {
      const affected = [args.principalKey, wearer.principalKey].filter((key): key is string => typeof key === 'string')
      await authorize(ctx, 'people.link', { householdId: wearer.householdId, subjects: affected })
      if (args.principalKey !== (wearer.principalKey ?? null)) {
        const textiles = await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', wearer.householdId)).collect()
        await authorize(ctx, 'textile.edit', { householdId: wearer.householdId, uses: { textileIds: textiles.filter((piece) => piece.wearerId === wearer._id && piece.private).map((piece) => piece._id) } })
      }
      const membership = (principalKey: string) => ctx.db
        .query('memberships')
        .withIndex('by_household_principal', (q) => q.eq('householdId', wearer.householdId).eq('principalKey', principalKey))
        .unique()
      if (args.principalKey !== null) {
        if ((await membership(args.principalKey)) === null) fail('invalid', 'Link a member of this household')
        const wearers = await ctx.db.query('wearers').withIndex('by_household', (q) => q.eq('householdId', wearer.householdId)).collect()
        if (wearers.some((other) => other._id !== wearer._id && other.principalKey === args.principalKey)) fail('conflict', 'That person is already linked to another name')
      }
    }
    const requirements = args.requirements === undefined ? undefined : await requirementsFrom(ctx, wearer.householdId, args.requirements)
    await ctx.db.patch(wearer._id, {
      ...(args.requirements === undefined ? {} : { requirements }),
      ...(args.name === undefined ? {} : { name: text(args.name, 'Name', 60) }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.principalKey === undefined ? {} : { principalKey: args.principalKey ?? undefined }),
    })
    // Whether a wearer is a baby decides which loads their clothes go in.
    if ((args.kind !== undefined && args.kind !== wearer.kind) || (args.requirements !== undefined && JSON.stringify(requirements ?? null) !== JSON.stringify(wearer.requirements ?? null))) await invalidatePlans(ctx, wearer.householdId)
    return null
  },
})

/** Removes a wearer; their clothes stay, as shared ones. */
export const removeWearer = mutation({
  args: { wearerId: v.id('wearers') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const wearer = await householdRow(ctx, 'people.edit', await ctx.db.get(args.wearerId))
    const textiles = await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', wearer.householdId)).collect()
    const theirs = textiles.filter((textile) => textile.wearerId === wearer._id)
    await authorize(ctx, 'textile.edit', { householdId: wearer.householdId, uses: { textileIds: theirs.filter((piece) => piece.private).map((piece) => piece._id) } })
    if (wearer.principalKey !== undefined) fail('conflict', 'Remove household access before removing their clothing profile.')
    const invite = await ctx.db.query('householdInvites').withIndex('by_wearer', (q) => q.eq('wearerId', wearer._id)).order('desc').first()
    if (invite !== null && invite.householdId === wearer.householdId && invite.usedAt === undefined && invite.revokedAt === undefined) await ctx.db.patch(invite._id, { revokedAt: Date.now() })
    const outfits = await ctx.db.query('dailyOutfits').withIndex('by_household_principal', (q) => q.eq('householdId', wearer.householdId)).collect()
    for (const outfit of outfits) if ((outfit.wearerId ?? outfit.items[0]?.wearerId) === wearer._id) await ctx.db.delete(outfit._id)
    for (const textile of theirs) await ctx.db.patch(textile._id, { wearerId: undefined })
    await ctx.db.delete(wearer._id)
    if (theirs.length > 0) await invalidatePlans(ctx, wearer.householdId)
    return null
  },
})





async function supplyRules(ctx: ReadCtx, supply: Doc<'supplies'>): Promise<Doc<'rules'>[]> {
  const rules = await ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', supply.householdId)).collect()
  return rules.filter((rule) => rule.supplyId === supply._id)
}






async function incompatibleProducts(ctx: MutationCtx, householdId: Id<'households'>, ids: readonly Id<'supplies'>[], ownId?: Id<'supplies'>): Promise<Id<'supplies'>[]> {
  if (ids.length > 50) fail('invalid', 'List at most 50 incompatible products')
  for (const id of ids) {
    const other = await ctx.db.get(id)
    if (other === null || other.householdId !== householdId || id === ownId) fail('invalid', 'Choose another product in this household')
  }
  return [...new Set(ids)].sort()
}


async function safetyFrom(ctx: MutationCtx, householdId: Id<'households'>, safety: Infer<typeof productSafety>, measure: SupplyMeasure | undefined, ownId?: Id<'supplies'>): Promise<Infer<typeof productSafety>> {
  const treatment = safety.pretreatment
  if (treatment !== undefined) {
    if (treatment.stainChemistry === undefined) fail('invalid', 'Record the pretreatment chemistry from the label')
    if (treatment.safeMaterials.length === 0) fail('invalid', 'Record the materials the pretreatment label permits')
    if (treatment.stainKinds.length === 0 || treatment.stainKinds.includes('unknown') || treatment.stainKinds.includes('combination')) fail('invalid', 'Record the stain types this label treats')
    if (treatment.stainChemistry === 'oxygen_bleach' && safety.bleachKind !== 'oxygen' || treatment.stainChemistry === 'chlorine_bleach' && safety.bleachKind !== 'chlorine') fail('invalid', 'Treatment chemistry must match the label bleach type')
  }
  const { ingredients, factSource, ...rest } = safety
  const capabilities = safety.capabilities
  if (capabilities !== undefined) {
    if (capabilities.length > 8 || new Set(capabilities.map((fact) => fact.kind)).size !== capabilities.length) fail('invalid', 'Record one fact per product capability')
    for (const fact of capabilities) {
      for (const [field, value, bound] of [['Variant', fact.variant, 200], ['Market', fact.market, 80], ['Formulation revision', fact.formulationRevision, 200], ['Capability source', fact.source, 500]] as const) text(value, field, bound)
      if (!Number.isFinite(fact.retrievedAt) || fact.retrievedAt <= 0 || fact.retrievedAt > Date.now() + 86_400_000) fail('invalid', 'Record a valid capability retrieval date')
      if (fact.status === 'absent' && fact.scope !== 'explicit_absence' || fact.status === 'present' && fact.scope === 'explicit_absence') fail('invalid', 'Absence requires an explicit absence statement; a partial ingredient list is not absence')
    }
  }
  if (safety.lipase !== undefined && safety.lipase.status !== 'unknown' && (!safety.lipase.formulation.trim() || !safety.lipase.source.trim())) fail('invalid', 'Record the exact formulation and lipase evidence source')
  if (safety.lipase !== undefined && (safety.lipase.formulation.length > 200 || safety.lipase.source.length > 300)) fail('invalid', 'Keep formulation identity to 200 characters and its source to 300')
  if (safety.sanitizing !== undefined) {
    positive(safety.sanitizing.minimumContactMinutes, 'Sanitizing contact time', 1440)
    text(safety.sanitizing.formulation, 'Exact sanitizing pack', 200)
    text(safety.sanitizing.source, 'Sanitizing label source', 300)
  }
  const soak = treatment?.soak
  if (soak !== undefined) {
    if (!Number.isFinite(soak.waterLitres) || soak.waterLitres <= 0 || soak.waterLitres > 50 || !Number.isInteger(soak.minimumMinutes) || !Number.isInteger(soak.maximumMinutes) || soak.minimumMinutes < 1 || soak.maximumMinutes < soak.minimumMinutes || soak.maximumMinutes > 1440 || !Number.isFinite(soak.maximumTemperatureC) || soak.maximumTemperatureC <= 0 || soak.maximumTemperatureC > 100) fail('invalid', 'Record a valid label water volume, temperature and time range')
    if (!['ml', 'g'].includes(treatment!.dose.unit)) fail('invalid', 'Soak directions need a measured ml or g dose for the recorded water volume')
    text(soak.transfer, 'After soaking directions', 300)
  }
  const source = optionalText(factSource, 'Fact source', 40)
  return {
    ...rest,
    ...(safety.lipase === undefined ? {} : { lipase: { ...safety.lipase, formulation: safety.lipase.formulation.trim().slice(0, 200), source: safety.lipase.source.trim().slice(0, 300) } }),
    ...(safety.sanitizing === undefined ? {} : { sanitizing: { ...safety.sanitizing, formulation: safety.sanitizing.formulation.trim(), source: safety.sanitizing.source.trim() } }),
    ...(ingredients === undefined ? {} : { ingredients: ingredientList(ingredients, 'Ingredient') }),
    ...(source === undefined ? {} : { factSource: source }),
    incompatibleSupplyIds: await incompatibleProducts(ctx, householdId, safety.incompatibleSupplyIds, ownId),
    incompatibleMaterials: materialList(safety.incompatibleMaterials),
    ...(treatment === undefined ? {} : { pretreatment: {
      ...treatment,
      dose: doseFrom(measure, { ...treatment.dose, measurementCue: treatment.dose.measurementCue ?? undefined }),
      stainKinds: [...new Set(treatment.stainKinds)],
      timing: text(treatment.timing, 'Pretreatment directions', 120),
      safeMaterials: materialList(treatment.safeMaterials),
      maximumTemperatureC: chemistryLimit(treatment.maximumTemperatureC, 100, 'Maximum temperature'),
      maximumPH: chemistryLimit(treatment.maximumPH, 14, 'Maximum pH'),
      ...(soak === undefined ? {} : { soak: { ...soak, transfer: soak.transfer.trim() } }),
    } }),
  }
}

export const createSupply = mutation({
  args: {
    intakeKey: v.optional(v.string()),
    householdId: v.id('households'),
    name: v.string(),
    kind: supplyKind,
    /** What it is for (Add a bottle or box); where it goes and when come from it. */
    use: v.optional(supplyUse),
    formulation: v.optional(formulationValidator),
    safety: v.optional(productSafety),
    measure: v.optional(supplyMeasure),
    provenance: provenanceValidator,
  },
  returns: v.id('supplies'),
  handler: async (ctx, { intakeKey, ...args }) => {
    const actor = (await authorize(ctx, 'supply.add', { householdId: args.householdId })).actor
    const save = await intakeSave(ctx, args.householdId, actor.key, 'product', intakeKey, args)
    if (save?.previous) return save.previous.result as Id<'supplies'>
    assertUseFits(args.use, args.kind)
    const safety = args.safety === undefined ? undefined : await safetyFrom(ctx, args.householdId, args.safety, args.measure)
    const supplyId = await ctx.db.insert('supplies', {
      householdId: args.householdId,
      ownerPrincipalKey: actor.key,
      name: text(args.name, 'Product name'),
      kind: args.kind,
      ...(args.use === undefined ? {} : { use: args.use }),
      formulation: formulation(args.formulation),
      ...(safety === undefined ? {} : { safety }),
      ...(args.measure === undefined ? {} : { measure: measureFrom(args.measure) }),
      provenance: provenance(args.provenance),
      createdAt: Date.now(),
    })
    await invalidatePlans(ctx, args.householdId)
    await save?.record(supplyId)
    return supplyId
  },
})

/**
 * "Ran out" (or "Restocked"): a product that runs out is left out of plans until it is restocked.
 * Nothing is substituted for it; a load that needs it waits for the person to choose another product.
 */
export const setRanOut = mutation({
  args: { supplyId: v.id('supplies'), ranOut: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    await ctx.db.patch(supply._id, { ranOutAt: args.ranOut ? Date.now() : undefined })
    await invalidatePlans(ctx, supply.householdId)
    return null
  },
})

export const updateSupply = mutation({
  args: {
    supplyId: v.id('supplies'),
    name: v.optional(v.string()),
    kind: v.optional(supplyKind),
    use: v.optional(supplyUse),
    formulation: v.optional(formulationValidator),
    safety: v.optional(productSafety),
    measure: v.optional(supplyMeasure),
    provenance: v.optional(provenanceValidator),
    archived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    let safety = args.safety === undefined ? undefined : await safetyFrom(ctx, supply.householdId, { ...args.safety, ...(supply.safety?.sourceContract === undefined ? {} : { sourceContract: supply.safety.sourceContract }) }, args.measure ?? supply.measure, supply._id)
    // Identity changes invalidate exact-pack evidence, including a stale full editor draft.
    const savedFormulation = typeof supply.formulation === 'string' ? { name: supply.formulation } : supply.formulation
    const identityChanged = args.name !== undefined && args.name.trim() !== supply.name || args.formulation !== undefined && JSON.stringify(formulation(args.formulation)) !== JSON.stringify(formulation(savedFormulation)) || args.safety?.ingredients !== undefined && JSON.stringify(safety?.ingredients) !== JSON.stringify(supply.safety?.ingredients)
    if (identityChanged) {
      // Keep restrictions, but a changed formulation cannot execute the prior pack's source rows.
      if (supply.safety?.sourceContract !== undefined) for (const rule of await supplyRules(ctx, supply)) await ctx.db.patch(rule._id, { provenance: { ...rule.provenance, confidence: 'unknown' } })
      const facts = safety ?? supply.safety
      if (facts !== undefined) {
        const { sanitizing: _sanitizing, capabilities: _capabilities, ...rest } = facts
        safety = { ...rest, ...(facts.lipase === undefined ? {} : { lipase: { status: 'unknown', formulation: '', source: '' } }) }
      }
    }
    assertUseFits(args.use ?? supply.use, args.kind ?? supply.kind)
    const measure = args.measure === undefined ? undefined : measureFrom(args.measure)
    if ((args.kind !== undefined && dryerKind(args.kind) !== dryerKind(supply.kind)) || measure !== undefined) {
      const rules = await supplyRules(ctx, supply)
      if (args.kind !== undefined && dryerKind(args.kind) !== dryerKind(supply.kind) && rules.length > 0) {
        fail('conflict', 'This product has label directions for the other machine; remove them before changing between a washer and a dryer product')
      }
      if (measure !== undefined) assertMarksKept(measure, rules)
    }
    await ctx.db.patch(supply._id, {
      ...(identityChanged ? { catalogBinding: undefined } : {}),
      ...(args.name === undefined ? {} : { name: text(args.name, 'Product name') }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.use === undefined ? {} : { use: args.use }),
      ...(args.formulation === undefined ? {} : { formulation: formulation(args.formulation) }),
      ...(safety === undefined ? {} : { safety }),
      ...(measure === undefined ? {} : { measure }),
      ...(args.provenance === undefined ? {} : { provenance: provenance(args.provenance) }),
      ...(args.archived === undefined ? {} : { archived: args.archived }),
    })
    // A new use moves every label line to where and when that use goes; a drawer answer is kept.
    if (args.use !== undefined && args.use !== supply.use) {
      const rules = await supplyRules(ctx, supply)
      if (rules.length > 0) {
        const [household, machines] = await Promise.all([
          ctx.db.get(supply.householdId),
          ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', supply.householdId)).collect(),
        ])
        const inDrawer = rules[0]!.placement === 'detergent_compartment'
        const { stage, placement, timing } = useDirections(args.use, washerPlacements(machines, household?.planning?.preferredMachineId), inDrawer)
        for (const rule of rules) await ctx.db.patch(rule._id, { stage, placement: placement as Doc<'rules'>['placement'], timing })
      }
    }
    await invalidatePlans(ctx, supply.householdId)
    return null
  },
})

const directionsRow = v.object({
  /** The row's heading, only when typed as printed; headings for untyped rows are made at display time. */
  rowText: v.optional(v.string()),
  loadSizes: v.optional(v.array(loadSize)),
  soilLevels: v.optional(v.array(soilLevel)),
  /** With sizes and soils: `or` is "large OR heavily soiled"; `and` (the default) needs both. */
  join: v.optional(v.union(v.literal('or'), v.literal('and'))),
  cells: v.array(v.object({ machineClass: v.optional(washerClass), amount: v.number(), unit: v.string(), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), target: v.optional(v.union(v.literal('below'), v.literal('just_below'))), approximate: v.optional(v.boolean()) })),
})

/**
 * Transcribes a product label's directions table: how the product is measured and its rows,
 * compiled into rules by the planner's own compiler so the editor previews exactly what is
 * stored. Replaces the product's earlier rules in one transaction.
 */
export const saveLabelDirections = mutation({
  args: {
    supplyId: v.id('supplies'),
    measure: supplyMeasure,
    stage,
    placement: rulePlacement,
    timing: v.string(),
    rows: v.array(directionsRow),
    provenance: provenanceValidator,
  },
  returns: v.array(v.id('rules')),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    const evidence = provenance(args.provenance)
    const measure = measureFrom(args.measure)
    const timing = text(args.timing, 'Timing', 120)
    for (const row of args.rows) optionalText(row.rowText, 'Row heading', 80)
    const compiled = compileDirections({ measure, stage: args.stage, placement: args.placement, timing, rows: args.rows }, supply.kind)
    if (!compiled.ok) fail('invalid', compiled.error)

    for (const rule of await supplyRules(ctx, supply)) await ctx.db.delete(rule._id)
    const ruleIds = await insertCompiledRules(ctx, supply, compiled.rules, evidence)
    await ctx.db.patch(supply._id, { measure })
    await invalidatePlans(ctx, supply.householdId)
    return ruleIds
  },
})

/**
 * Stores compiled label rows as the product's rules, under their own row numbers or, with `row`, all
 * under that one. A heading is stored only when the person typed it. Callers invalidate plans.
 */
async function insertCompiledRules(ctx: MutationCtx, supply: Doc<'supplies'>, compiled: readonly CompiledRule[], evidence: Provenance, row?: number): Promise<Id<'rules'>[]> {
  const now = Date.now()
  const ruleIds: Id<'rules'>[] = []
  for (const rule of compiled) {
    ruleIds.push(await ctx.db.insert('rules', {
      householdId: supply.householdId,
      supplyId: supply._id,
      conditions: rule.conditions,
      dose: rule.dose,
      // The compiler only passes the stages and placements its table was checked against.
      stage: rule.stage as Doc<'rules'>['stage'],
      placement: rule.placement as Doc<'rules'>['placement'],
      timing: rule.timing,
      row: row ?? rule.row,
      ...(rule.rowText === undefined ? {} : { rowText: rule.rowText }),
      provenance: evidence,
      createdAt: now,
    }))
  }
  return ruleIds
}







/**
 * Saves one line of a product's label, for exactly the load it was asked about (a question card):
 * its size, soil and HE when known, "also very dirty loads" (size or heavy), or "the same for every
 * load". The dose is what the cap or count shows; the line's words are stored only when typed.
 * A line with the same conditions is replaced and keeps its number ("Change"); otherwise the line
 * is added after the others, which are never touched. Where and when the product goes is copied from
 * its other lines, or for its first line comes from what the product is for.
 */
export const answerLabelRow = mutation({
  args: {
    supplyId: v.id('supplies'),
    context: v.object({ loadSize: v.optional(loadSize), soilLevel: v.optional(soilLevel), washerClass: v.optional(washerClass) }),
    /** "This line also covers very dirty loads": the asked size, or a heavy load. */
    alsoVeryDirty: v.optional(v.boolean()),
    /** "It's the same for every load": no size or soil condition. */
    sameForAll: v.optional(v.boolean()),
    /** "It goes in the drawer": a booster, stain remover or sanitizer's first line only. */
    inDrawer: v.optional(v.boolean()),
    dose: v.object({ amount: v.number(), unit: v.string(), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), target: v.optional(v.union(v.literal('below'), v.literal('just_below'))), approximate: v.optional(v.boolean()) }),
    /** The line as printed, only when the person typed it. */
    rowText: v.optional(v.string()),
  },
  returns: v.object({ ruleIds: v.array(v.id('rules')), row: v.number() }),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    if (supply.measure === undefined) fail('invalid', 'Say how the product is measured first')
    const { context } = args
    const dryerProduct = dryerKind(supply.kind)
    if (dryerProduct && (context.soilLevel !== undefined || context.washerClass !== undefined || args.alsoVeryDirty === true)) {
      fail('invalid', 'Dryer product labels do not dose by soil level or washer class')
    }
    if (args.alsoVeryDirty === true) {
      if (args.sameForAll === true) fail('invalid', 'A line for every load already covers very dirty loads')
      if (context.loadSize === undefined || context.soilLevel === 'heavy') fail('invalid', 'Only a line for a load size that is not very dirty can also cover very dirty loads')
    }
    const existing = await supplyRules(ctx, supply)
    const sizes: LoadSize[] = args.sameForAll === true || context.loadSize === undefined ? [] : [context.loadSize]
    const soils: SoilLevel[] = args.sameForAll === true ? [] : args.alsoVeryDirty === true ? ['heavy'] : context.soilLevel === undefined ? [] : [context.soilLevel]
    const classes = context.washerClass === undefined ? [] : [context.washerClass]
    // Before the drum is seen no size is known, so a washer line saved without one would read the same
    // for every load. That needs the person's "same for every load", or a printed line with this dose
    // that already covers every load this one would (choosing between two of them: no size or other
    // limit, and its soils and classes include these); otherwise the size is asked at the machine.
    const covers = (have: readonly string[] = [], want: readonly string[]) => have.length === 0 || (want.length > 0 && want.every((entry) => have.includes(entry)))
    const coveredBy = (rule: Doc<'rules'>) => {
      const { loadSizes = [], cycles = [], materials = [], sourceLoadCategories = [], minBulkUnits, maxBulkUnits, soilLevels, machineClasses } = rule.conditions
      return loadSizes.length + cycles.length + materials.length + sourceLoadCategories.length === 0 && minBulkUnits === undefined && maxBulkUnits === undefined
        && covers(soilLevels, soils) && covers(machineClasses, classes) && sameDose(rule.dose, args.dose)
    }
    if (!dryerProduct && context.loadSize === undefined && args.sameForAll !== true && !existing.some(coveredBy)) {
      fail('invalid', 'Say whether this line is for every load or depends on how full the washer is')
    }
    const rowText = optionalText(args.rowText, 'Label line', 80)
    const join = args.alsoVeryDirty === true ? 'or' as const : undefined
    const row: DirectionsRow = {
      ...(rowText === undefined ? {} : { rowText }),
      ...(sizes.length === 0 ? {} : { loadSizes: sizes }),
      ...(soils.length === 0 ? {} : { soilLevels: soils }),
      ...(join === undefined ? {} : { join }),
      cells: [{ ...(context.washerClass === undefined ? {} : { machineClass: context.washerClass }), ...args.dose }],
    }

    // All of a product's lines go in the same place at the same time, so a step decided at the machine never moves.
    const first = existing[0]
    let direction: { stage: string; placement: string; timing: string }
    if (first !== undefined) {
      direction = { stage: first.stage, placement: first.placement, timing: first.timing }
    } else {
      if (supply.use === undefined) fail('invalid', 'Say what kind of product this is first')
      const [household, machines] = await Promise.all([
        ctx.db.get(supply.householdId),
        ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', supply.householdId)).collect(),
      ])
      direction = useDirections(supply.use, washerPlacements(machines, household?.planning?.preferredMachineId), args.inDrawer)
    }
    const compiled = compileDirections({ measure: supply.measure, ...direction, rows: [row] }, supply.kind)
    if (!compiled.ok) fail('invalid', compiled.error)

    const rows = new Map<number, Doc<'rules'>[]>()
    for (const rule of existing) if (rule.row !== undefined) rows.set(rule.row, [...(rows.get(rule.row) ?? []), rule])
    const shape: RowShape = { sizes, soils, join: join ?? 'and', classes }
    const replaced = [...rows].find(([, rules]) => sameShape(storedShape(rules), shape))
    const number = replaced?.[0] ?? Math.max(0, ...rows.keys()) + 1
    for (const rule of replaced?.[1] ?? []) await ctx.db.delete(rule._id)
    const ruleIds = await insertCompiledRules(ctx, supply, compiled.rules, labelEvidence, number)
    // A label line only changes doses, so a plan already under way keeps its loads.
    await invalidatePlans(ctx, supply.householdId, { dosesOnly: true })
    return { ruleIds, row: number }
  },
})

/** Removes one line of a product's label: every rule saved for that row. */
export const removeLabelRow = mutation({
  args: { supplyId: v.id('supplies'), row: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    const rules = (await supplyRules(ctx, supply)).filter((rule) => rule.row === args.row)
    for (const rule of rules) await ctx.db.delete(rule._id)
    if (rules.length > 0) await invalidatePlans(ctx, supply.householdId, { dosesOnly: true })
    return null
  },
})



/**
 * Saves one label-backed dose rule. The planner uses it only when its evidence says the label was
 * read. Editing without `conditions` keeps the rule's conditions; a dryer product always goes in
 * the dryer drum, and a washer product never does.
 */
export const saveRule = mutation({
  args: {
    supplyId: v.id('supplies'),
    ruleId: v.optional(v.id('rules')),
    dose: v.object({ amount: v.number(), unit: v.string(), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), measurementCue: v.optional(v.string()) }),
    stage,
    placement: rulePlacement,
    timing: v.string(),
    conditions: v.optional(ruleConditions),
    incompatibleSupplyIds: v.optional(v.array(v.id('supplies'))),
    incompatibleMaterials: v.optional(v.array(v.string())),
    sharedCompartmentCompatible: v.optional(v.boolean()),
    maximumTemperatureC: v.optional(v.number()),
    stainChemistry: v.optional(stainChemistry),
    stainKinds: v.optional(v.array(stainKind)),
    safeMaterials: v.optional(v.array(v.string())),
    maximumPH: v.optional(v.number()),
    provenance: provenanceValidator,
  },
  returns: v.id('rules'),
  handler: async (ctx, args) => {
    const supply = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.supplyId))
    const existing = args.ruleId === undefined ? null : await householdRow(ctx, 'supply.edit', await ctx.db.get(args.ruleId))
    if (existing !== null && existing.supplyId !== supply._id) fail('invalid', 'Rule belongs to another product')
    const dryerProduct = dryerKind(supply.kind)
    if (!dryerProduct && (args.stage === 'dry' || args.placement === 'dryer_drum')) fail('invalid', 'Only a dryer product goes in the dryer')
    const fields = {
      householdId: supply.householdId,
      supplyId: supply._id,
      dose: doseFrom(supply.measure, args.dose),
      stage: dryerProduct ? 'dry' as const : args.stage,
      placement: dryerProduct ? 'dryer_drum' as const : args.placement,
      timing: text(args.timing, 'Timing', 120),
      conditions: conditionsFrom(args.conditions ?? existing?.conditions ?? {}, dryerProduct),
      provenance: provenance(args.provenance),
      ...(args.incompatibleSupplyIds === undefined ? {} : { incompatibleSupplyIds: await incompatibleProducts(ctx, supply.householdId, args.incompatibleSupplyIds, supply._id) }),
      ...(args.incompatibleMaterials === undefined ? {} : { incompatibleMaterials: materialList(args.incompatibleMaterials) }),
      ...(args.sharedCompartmentCompatible === undefined ? {} : { sharedCompartmentCompatible: args.sharedCompartmentCompatible }),
      ...(args.maximumTemperatureC === undefined ? {} : { maximumTemperatureC: chemistryLimit(args.maximumTemperatureC, 100, 'Maximum temperature') }),
      ...(args.stainChemistry === undefined ? {} : { stainChemistry: args.stainChemistry }),
      ...(args.stainKinds === undefined ? {} : { stainKinds: [...new Set(args.stainKinds)] }),
      ...(args.safeMaterials === undefined ? {} : { safeMaterials: materialList(args.safeMaterials) }),
      ...(args.maximumPH === undefined ? {} : { maximumPH: chemistryLimit(args.maximumPH, 14, 'Maximum pH') }),
    }
    if (existing === null) {
      const ruleId = await ctx.db.insert('rules', { ...fields, createdAt: Date.now() })
      await invalidatePlans(ctx, supply.householdId)
      return ruleId
    }
    // A patch keeps what this form does not edit: the directions row and the sample fixture key.
    await ctx.db.patch(existing._id, fields)
    await invalidatePlans(ctx, supply.householdId)
    return existing._id
  },
})

export const removeRule = mutation({
  args: { ruleId: v.id('rules') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rule = await householdRow(ctx, 'supply.edit', await ctx.db.get(args.ruleId))
    await ctx.db.delete(rule._id)
    await invalidatePlans(ctx, rule.householdId)
    return null
  },
})

// ---- Machines --------------------------------------------------------------

const machineArgs = {
  model: v.optional(v.string()),
  applianceType: v.optional(applianceType),
  /** Washers only. `null` returns it to not recorded, which asks before using HE or standard rows. */
  highEfficiency: v.optional(v.union(v.boolean(), v.null())),
  /** Dryers only: each heat button with the words printed on it. */
  heatSettings: v.optional(v.array(heatSetting)),
  capacityUnits: v.optional(v.number()),
  capacityConfidence: v.optional(evidenceLevel),
  supportedCycles: v.optional(v.array(v.string())),
  placements: v.optional(v.array(placement)),
  /** Minutes per cycle name; a dryer records only `timed`, the minutes one start buys. */
  cycleMinutes: v.optional(v.record(v.string(), v.number())),
  cycleModes: v.optional(v.record(v.string(), dryerProgramMode)),
  rinseContact: v.optional(rinseContact),
  washProcesses: v.optional(washProcesses),
  availability: v.optional(availability),
  /** At home, or in a shared laundry room. */
  location: v.optional(machineLocation),
  /** What one start costs in a shared room. */
  pricePerStart: v.optional(v.number()),
  /** Minutes one start buys, for a dryer paid per time block. */
  blockMinutes: v.optional(v.number()),
  /** The drum volume as the sticker prints it; the about-capacity is derived from it. `null` clears both. */
  drumVolume: v.optional(v.union(drumVolume, v.null())),
}








export const createMachine = mutation({
  args: { householdId: v.id('households'), name: v.string(), provenance: provenanceValidator, ...machineArgs },
  returns: v.id('machines'),
  handler: async (ctx, args) => {
    await authorize(ctx, 'machine.add', { householdId: args.householdId })
    const machineId = await ctx.db.insert('machines', {
      householdId: args.householdId,
      pool: 'available',
      dispensingProfile: {},
      ...machineFields(args, null),
      name: text(args.name, 'Machine name'),
      provenance: provenance(args.provenance),
      createdAt: Date.now(),
    })
    await invalidatePlans(ctx, args.householdId)
    return machineId
  },
})

/** Optional home setup records the pair; capacities, cycles and dispensing still need their labels. */
export const createHomePair = mutation({
  args: { householdId: v.id('households') },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    await authorize(ctx, 'machine.add', { householdId: householdId })
    const home = (await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect())
      .filter((machine) => machine.location === 'home' && !machine.archived)
    for (const role of ['washer', 'dryer'] as const) {
      if (home.some((machine) => machineRole(machine) === role)) continue
      await ctx.db.insert('machines', {
        householdId, name: role === 'washer' ? 'Washer' : 'Dryer', location: 'home',
        ...(role === 'dryer' ? { applianceType: 'tumble_dryer' as const } : {}),
        pool: 'available', dispensingProfile: {},
        provenance: { source: 'home-setup', confidence: 'unknown' }, createdAt: Date.now(),
      })
    }
    await invalidatePlans(ctx, householdId)
    return null
  },
})

export const updateMachine = mutation({
  args: { machineId: v.id('machines'), name: v.optional(v.string()), archived: v.optional(v.boolean()), provenance: v.optional(provenanceValidator), ...machineArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine = await householdRow(ctx, 'machine.edit', await ctx.db.get(args.machineId))
    await ctx.db.patch(machine._id, machineFields(args, machine))
    // The HE logo, answered at the machine, only changes doses; any other edit can change the loads.
    const dosesOnly = Object.keys(args).every((key) => key === 'machineId' || key === 'highEfficiency')
    await invalidatePlans(ctx, machine.householdId, { dosesOnly })
    return null
  },
})




/**
 * "How many like it?": one entry adds `count` identical machines in one call, named "{name} 1…n",
 * each with the same answers (HE, price, minutes, heat buttons), so a shared room's four washers
 * are four rows the pass can tell apart.
 */
export const createMachines = mutation({
  args: { householdId: v.id('households'), name: v.string(), count: v.number(), provenance: provenanceValidator, intakeKey: v.optional(v.string()), ...machineArgs },
  returns: v.array(v.id('machines')),
  handler: async (ctx, { intakeKey, count, ...args }) => {
    const actor = (await authorize(ctx, 'machine.add', { householdId: args.householdId })).actor
    const save = await intakeSave(ctx, args.householdId, actor.key, 'appliance', intakeKey, { count, ...args })
    if (save?.previous) return save.previous.result as Id<'machines'>[]
    const names = siblingNames(args.name, siblingCount(count))
    const fields = machineFields(args, null)
    const evidence = provenance(args.provenance)
    const createdAt = Date.now()
    const machineIds: Id<'machines'>[] = []
    for (const name of names) {
      machineIds.push(await ctx.db.insert('machines', {
        householdId: args.householdId,
        pool: 'available',
        dispensingProfile: {},
        ...fields,
        name,
        provenance: evidence,
        createdAt,
      }))
    }
    await invalidatePlans(ctx, args.householdId)
    await save?.record(machineIds)
    return machineIds
  },
})

/**
 * A shared room's washer or dryer entered at arrival by the label on it. An earlier label is only a
 * shortcut; a label not recorded yet becomes a new machine like the one given (same kind, model,
 * buttons, minutes and price), with its capacity unknown, so its fit is never assumed. The same
 * label twice gives the machine already recorded.
 */
export const addMachineLikeIt = mutation({
  args: { machineId: v.id('machines'), name: v.string() },
  returns: v.id('machines'),
  handler: async (ctx, args) => {
    const like = await householdRow(ctx, 'machine.add', await ctx.db.get(args.machineId))
    const name = text(args.name, 'Machine label', 40)
    const household = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', like.householdId)).collect()
    const same = household.find((machine) => machine.archived !== true && machineRole(machine) === machineRole(like) && machine.name.trim().toLowerCase() === name.toLowerCase())
    if (same !== undefined) return same._id
    const machineId = await ctx.db.insert('machines', {
      householdId: like.householdId,
      name,
      ...(like.model === undefined ? {} : { model: like.model }),
      ...(like.applianceType === undefined ? {} : { applianceType: like.applianceType }),
      ...(like.highEfficiency === undefined ? {} : { highEfficiency: like.highEfficiency }),
      ...(like.heatSettings === undefined ? {} : { heatSettings: like.heatSettings }),
      ...(like.supportedCycles === undefined ? {} : { supportedCycles: like.supportedCycles }),
      ...(like.location === undefined ? {} : { location: like.location }),
      ...(like.pricePerStart === undefined ? {} : { pricePerStart: like.pricePerStart }),
      ...(like.blockMinutes === undefined ? {} : { blockMinutes: like.blockMinutes }),
      ...(like.cycleProfile === undefined ? {} : { cycleProfile: like.cycleProfile }),
      capacityConfidence: 'unknown',
      pool: 'available',
      dispensingProfile: like.dispensingProfile,
      provenance: like.provenance,
      createdAt: Date.now(),
    })
    await invalidatePlans(ctx, like.householdId)
    return machineId
  },
})

/**
 * Edits identical machines together: every answer goes to every sibling, and a new name renames
 * them "{name} 1…n" in the order given. All of them belong to one household.
 */
export const updateMachineGroup = mutation({
  args: { machineIds: v.array(v.id('machines')), name: v.optional(v.string()), provenance: v.optional(provenanceValidator), ...machineArgs },
  returns: v.null(),
  handler: async (ctx, { machineIds, name, ...args }) => {
    const ids = [...new Set(machineIds)]
    siblingCount(ids.length)
    const machines = await Promise.all(ids.map(async (machineId) => householdRow(ctx, 'machine.edit', await ctx.db.get(machineId))))
    const householdId = machines[0]!.householdId
    if (machines.some((machine) => machine.householdId !== householdId)) fail('forbidden', 'Forbidden')
    const names = name === undefined ? null : siblingNames(name, machines.length)
    for (const [index, machine] of machines.entries()) {
      await ctx.db.patch(machine._id, { ...machineFields(args, machine), ...(names === null ? {} : { name: names[index]! }) })
    }
    await invalidatePlans(ctx, householdId)
    return null
  },
})

// ---- Household planning preferences ---------------------------------------

export const setPlanning = mutation({
  args: {
    householdId: v.id('households'),
    colorPolicy: v.optional(v.union(v.literal('separate'), v.literal('allow'), v.literal('separate_first_wash'))),
    preferredMachineId: v.optional(v.id('machines')),
    preferredDryerId: v.optional(v.id('machines')),
    washerPricePerStart: v.optional(v.number()),
    dryerPricePerStart: v.optional(v.number()),
    currency: v.optional(v.string()),
    /** Wash baby clothes on their own; unset is on. */
    babySeparate: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx: MutationCtx, args) => {
    await authorize(ctx, 'household.edit', { householdId: args.householdId })
    const householdMachine = async (machineId: Id<'machines'>) => (await related(ctx, args.householdId, { machineIds: [machineId] })).machines[0]!
    if (args.preferredMachineId !== undefined && isDryingMachine(await householdMachine(args.preferredMachineId))) fail('invalid', 'The preferred washer must be a washer')
    if (args.preferredDryerId !== undefined && !isDryer(await householdMachine(args.preferredDryerId))) fail('invalid', 'The preferred dryer must be a dryer')
    const household = await ctx.db.get(args.householdId)
    await ctx.db.patch(args.householdId, {
      planning: {
        ...(household?.planning ?? {}),
        ...(args.colorPolicy === undefined ? {} : { colorPolicy: args.colorPolicy }),
        ...(args.preferredMachineId === undefined ? {} : { preferredMachineId: args.preferredMachineId }),
        ...(args.preferredDryerId === undefined ? {} : { preferredDryerId: args.preferredDryerId }),
        ...(args.washerPricePerStart === undefined ? {} : { washerPricePerStart: positive(args.washerPricePerStart, 'Price', 1000) }),
        ...(args.dryerPricePerStart === undefined ? {} : { dryerPricePerStart: positive(args.dryerPricePerStart, 'Dryer price', 1000) }),
        ...(args.currency === undefined ? {} : { currency: text(args.currency, 'Currency', 3).toUpperCase() }),
        ...(args.babySeparate === undefined ? {} : { babySeparate: args.babySeparate }),
      },
    })
    await invalidatePlans(ctx, args.householdId)
    return null
  },
})

/**
 * The household's own wash and dryer minutes, asked once at home when a load has none recorded
 * (design 5.5). Both may be skipped: `askedAt` alone records "Not now" so it is not asked again. Only
 * the hub's timing reads these; plans are not re-made.
 */
export const setLaundryTimes = mutation({
  args: { householdId: v.id('households'), washMinutes: v.optional(v.number()), dryerMinutes: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'household.edit', { householdId: args.householdId })
    for (const [value, field] of [[args.washMinutes, 'Wash'], [args.dryerMinutes, 'Dryer']] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 10 || value > 240)) fail('invalid', `${field} must be between 10 and 240 minutes`)
    }
    const household = await ctx.db.get(args.householdId)
    await ctx.db.patch(args.householdId, { planning: { ...(household?.planning ?? {}), times: {
      ...(args.washMinutes === undefined ? {} : { washMinutes: args.washMinutes }),
      ...(args.dryerMinutes === undefined ? {} : { dryerMinutes: args.dryerMinutes }),
      askedAt: Date.now(),
    } } })
    return null
  },
})

/** Household laundry-day preferences; updating them does not remake or start a plan. */
export const setLaundryDay = mutation({
  args: { householdId: v.id('households'), rackLoads: v.optional(v.number()), loadsPerDay: v.optional(v.number()), pace: v.optional(v.union(v.literal('all'), v.literal('spread'))), finishBy: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'household.edit', { householdId: args.householdId })
    for (const value of [args.rackLoads, args.loadsPerDay]) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 3)) fail('invalid', 'Choose 1, 2 or 3')
    }
    if (args.finishBy !== undefined && args.finishBy !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.finishBy)) fail('invalid', 'Choose a valid finish time')
    const household = await ctx.db.get(args.householdId)
    const day = household?.planning?.day ?? {}
    await ctx.db.patch(args.householdId, { planning: { ...(household?.planning ?? {}), day: {
      ...day,
      ...(args.rackLoads === undefined ? {} : { rackLoads: args.rackLoads }),
      ...(args.loadsPerDay === undefined ? {} : { loadsPerDay: args.loadsPerDay }),
      ...(args.pace === undefined ? {} : { pace: args.pace }),
      ...(args.finishBy === undefined ? {} : { finishBy: args.finishBy ?? undefined }),
    } } })
    return null
  },
})

/**
 * Saves the household's water answers as a whole: a new ZIP arrives without its old area or override.
 * The band is classified here from the sourced records; the planner re-reads it, so plans re-plan.
 */
export const setWater = mutation({
  args: {
    householdId: v.id('households'),
    water: v.object({
      zip: v.optional(v.string()),
      utility: householdWater.fields.utility,
      area: v.optional(v.string()),
      source: householdWater.fields.source,
      reading: householdWater.fields.reading,
    }),
  },
  returns: v.null(),
  handler: async (ctx: MutationCtx, args) => {
    await authorize(ctx, 'household.edit', { householdId: args.householdId })
    const { zip, area, source, reading } = args.water
    if (zip !== undefined && !validZip(zip)) fail('invalid', 'A ZIP code is five digits')
    if (area !== undefined && !ebmudAreas.some(([id]) => id === area)) fail('invalid', 'Unknown area')
    if ((source === 'strip' || source === 'utility_report') && reading === undefined) fail('invalid', 'Enter the reading')
    const reportYear = reading?.reportYear
    if (source === 'utility_report' && reportYear === undefined) fail('invalid', 'Enter the year of the report')
    if (reportYear !== undefined && (source !== 'utility_report' || !Number.isInteger(reportYear) || reportYear < 1990 || reportYear > new Date().getUTCFullYear())) fail('invalid', 'That report year is out of range')
    if (reading !== undefined && (!Number.isFinite(reading.value) || reading.value < 0 || mgLOf(reading.value, reading.unit) > 2000)) fail('invalid', 'That reading is out of range')
    const answers = { ...args.water, setAt: Date.now() }
    const household = await ctx.db.get(args.householdId)
    const water = { ...answers, ...classifyWater(answers, answers.setAt) }
    await ctx.db.patch(args.householdId, { planning: { ...(household?.planning ?? {}), water } })
    // Water only ever changes doses, so a plan already under way is re-read in place.
    await invalidatePlans(ctx, args.householdId, { dosesOnly: true })
    await scheduleWaterWindowEnd(ctx, args.householdId, water)
    return null
  },
})

/** Soft water that lapses with time (a strip, a softener, a report's age) re-plans when it lapses. */
async function scheduleWaterWindowEnd(ctx: MutationCtx, householdId: Id<'households'>, water: HouseholdWater) {
  const end = softUntil(water, Date.now())
  if (end !== undefined) await ctx.scheduler.runAt(end, internal.inventory.waterWindowEnded, { householdId, setAt: water.setAt })
}

/** The soft-water window ended: re-plan, unless the household saved new water since. */
export const waterWindowEnded = internalMutation({
  args: { householdId: v.id('households'), setAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const water = (await ctx.db.get(args.householdId))?.planning?.water
    // Early runs change nothing: the plan's input changes only once soft no longer qualifies.
    if (water?.setAt === args.setAt && qualifyingWaterCondition(water, Date.now()) !== 'soft') await invalidatePlans(ctx, args.householdId, { dosesOnly: true })
    return null
  },
})

/**
 * Run once after a release that changes the bundled water data (such as a new EBMUD report) or how
 * soft water qualifies: every household with water re-plans and gets a window timer from the new data.
 * `npx convex run inventory:waterDataChanged`
 */
export const waterDataChanged = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // ponytail: scans every household; page it if households grow past one transaction.
    let count = 0
    for (const household of await ctx.db.query('households').collect()) {
      const water = household.planning?.water
      if (water === undefined) continue
      // Only plans whose water input would now differ are re-planned.
      const current = qualifyingWaterCondition(water, Date.now())
      let differs = false
      for (const status of ['ready', 'needs_confirmation', 'used'] as const) {
        const stored = await ctx.db.query('plans').withIndex('by_household_status', (q) => q.eq('householdId', household._id).eq('status', status)).collect()
        for (const plan of stored) {
          if ((await readPlanDocuments(ctx, plan)).inputSnapshot.waterCondition !== current) differs = true
        }
      }
      if (differs) await invalidatePlans(ctx, household._id, { dosesOnly: true })
      await scheduleWaterWindowEnd(ctx, household._id, water)
      count += 1
    }
    return count
  },
})


/**
 * When the Closet says something has sat too long, when clothes count as not worn for a while, and
 * who gets the heads-up about urgent flags. Omitted values are kept; unset values take their defaults.
 */
export const setClosetPreferences = mutation({
  args: {
    householdId: v.id('households'),
    hamperDays: v.optional(v.number()),
    wetDays: v.optional(v.number()),
    cleanerDays: v.optional(v.number()),
    notWornDays: v.optional(v.number()),
    laundryPersonKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'household.edit', { householdId: args.householdId })
    if (args.laundryPersonKey !== undefined) {
      const member = await ctx.db
        .query('memberships')
        .withIndex('by_household_principal', (q) => q.eq('householdId', args.householdId).eq('principalKey', args.laundryPersonKey!))
        .unique()
      if (member === null) fail('invalid', 'The laundry person must be a member of this household')
    }
    const household = await ctx.db.get(args.householdId)
    await ctx.db.patch(args.householdId, {
      closet: {
        ...(household?.closet ?? {}),
        ...(args.hamperDays === undefined ? {} : { hamperDays: wholeDays(args.hamperDays, 'Hamper', 1, 60) }),
        ...(args.wetDays === undefined ? {} : { wetDays: wholeDays(args.wetDays, 'Wet things', 1, 60) }),
        ...(args.cleanerDays === undefined ? {} : { cleanerDays: wholeDays(args.cleanerDays, 'At the cleaner', 1, 60) }),
        ...(args.notWornDays === undefined ? {} : { notWornDays: wholeDays(args.notWornDays, 'Not worn', 30, 365) }),
        ...(args.laundryPersonKey === undefined ? {} : { laundryPersonKey: args.laundryPersonKey }),
      },
    })
    return null
  },
})
