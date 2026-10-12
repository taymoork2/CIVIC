import { v } from 'convex/values'

import {
  dryerPlacements,
  loadSizes,
  placements,
  soilLevels,
  stages,
  type ApplicationConditions,
  type ApplicationRule,
  type DryerPlacement,
  type GarmentKind,
  type LoadSize,
  type Placement,
  type PlannerSupplyKind,
  type SoilLevel,
  type Stage,
} from '@washcloset/planner'
import { ownedDispensingDevices, ownedWasherSupplies, sanitizedInvoiceGarments } from '../packages/planner/src/fixtures'
import { fixtureCatalogReviewedAt, invoiceCatalogReference, roomMachineCatalog } from '../packages/planner/src/fixture-catalog'

import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { authorize } from './access'
import { fail } from './errors'
import { busyTextiles, invalidatePlans } from './plans'
import type { Dose, Provenance, RuleConditions } from './validators'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

type FixtureEvidence = { source?: string; status?: string } | null | undefined

/** Fixture seeding is development/test only; deployments without this flag refuse it. */
export function fixturesEnabled(): boolean {
  return process.env.WASHCLOSET_DEV_FIXTURES === 'enabled'
}

/**
 * Converts evidence written into the sanitized fixture into the provenance stored in Convex.
 * The fixture was authored by developers, so its `status: 'verified'` is a claim about the
 * fixture, not proof that the household's own care labels, product labels, or machine plates
 * were read. Sample evidence is therefore always `unknown`, the one level that fails every
 * planner evidence check, while the source stays traceable to the fixture and its original
 * source string (e.g. 'owned-tide-label') so a person can find what to verify.
 */
export function fixtureProvenance(fixtureEvidence: FixtureEvidence): Provenance {
  return { source: `sanitized-fixture:${fixtureEvidence?.source ?? 'unsourced'}`, confidence: 'unknown' }
}

export function fixtureSupplyName(supply: { readonly brand?: string | null; readonly product?: string | null; readonly name?: string | null; readonly id: string }): string {
  const product = (supply.product ?? supply.name ?? supply.id).trim()
  const brand = supply.brand?.trim()
  return brand && product.toLocaleLowerCase() !== brand.toLocaleLowerCase() && !product.toLocaleLowerCase().startsWith(`${brand.toLocaleLowerCase()} `)
    ? `${brand} ${product}` : product
}

function vocabularyValues<Value extends string>(values: readonly string[] | undefined, vocabulary: readonly Value[]): Value[] | undefined {
  return values === undefined ? undefined : vocabulary.filter((value) => values.includes(value))
}

function fixtureConditions(conditions: ApplicationConditions | undefined): RuleConditions {
  const sizes = vocabularyValues<LoadSize>(conditions?.loadSizes ?? (conditions?.loadSize === undefined ? undefined : [conditions.loadSize]), loadSizes)
  const soils = vocabularyValues<SoilLevel>(conditions?.soilLevels, soilLevels)
  return {
    ...(conditions?.minBulkUnits === undefined ? {} : { minBulkUnits: conditions.minBulkUnits }),
    ...(conditions?.maxBulkUnits === undefined ? {} : { maxBulkUnits: conditions.maxBulkUnits }),
    ...(conditions?.cycles === undefined ? {} : { cycles: [...conditions.cycles] }),
    ...(sizes === undefined ? {} : { loadSizes: sizes }),
    ...(soils === undefined ? {} : { soilLevels: soils }),
    ...(conditions?.machineClasses === undefined ? {} : { machineClasses: [...conditions.machineClasses] }),
  }
}

function fixtureDose(rule: ApplicationRule): Dose {
  if (typeof rule.dose === 'object' && rule.dose !== null) {
    return {
      amount: rule.dose.amount,
      unit: rule.dose.unit,
      ...(typeof rule.dose.mark === 'string' ? { mark: rule.dose.mark } : {}),
      ...(rule.dose.fractionOfMark === undefined ? {} : { fractionOfMark: rule.dose.fractionOfMark }),
      ...(rule.dose.measurementCue === undefined ? {} : { measurementCue: rule.dose.measurementCue }),
    }
  }
  return { amount: (typeof rule.dose === 'number' ? rule.dose : rule.doseAmount) ?? 0, unit: rule.doseUnit ?? 'unknown' }
}

function fixtureStage(stage: string | undefined): Stage {
  return (stages as readonly string[]).includes(stage ?? '') ? stage as Stage : 'wash'
}

function fixturePlacement(rule: ApplicationRule): Placement | DryerPlacement {
  if (![...placements, ...dryerPlacements].includes(rule.placement as Placement)) throw new Error(`Fixture rule ${rule.id} has no stored placement`)
  return rule.placement as Placement | DryerPlacement
}

const roomMachineEvidence = { source: 'owner-shared-room-notes', confidence: 'observed' as const }

/** Infer only the garment types stated plainly by the invoice name. */
export function fixtureGarmentKind(name: string): GarmentKind | null {
  if (/\btee\b/i.test(name)) return 't_shirt'
  if (/\bshorts\b/i.test(name)) return 'shorts'
  if (/\bpants\b/i.test(name)) return 'pants'
  return null
}

/** Invoice SKU is identity metadata, not part of the displayed garment title. */
export function fixtureGarmentIdentity(invoiceName: string): { name: string; styleNumber?: string } {
  const match = /^(\d{4}[A-Z]?)\s+(.+)$/.exec(invoiceName)
  return match ? { name: match[2]!, styleNumber: match[1]! } : { name: invoiceName }
}

const trialRoomMachines = [
  { key: 'trial-top', name: 'Top-loader', count: 8, model: 'SWNNX2HP115TW01', applianceType: 'top_load_washer', volume: roomMachineCatalog.SWNNX2HP115TW01.drumVolumeCuFt, minutes: 47, price: 2,
    placements: ['direct_to_drum'] as const },
  { key: 'trial-front', name: 'Front-loader', count: 4, model: 'SFNNXRSP115TW07', applianceType: 'front_load_washer', volume: 3.42, minutes: 35, price: 2,
    placements: ['detergent_compartment', 'bleach_compartment', 'softener_compartment', 'direct_to_drum'] as const },
  { key: 'trial-dryer', name: 'Dryer', count: 20, model: 'SSGNCFGW113TW01', applianceType: 'tumble_dryer', volume: roomMachineCatalog.SSGNCFGW113TW01.drumVolumeCuFt, minutes: 16, price: 0.5,
    placements: [] as const },
] as const

type FixtureTable = 'textiles' | 'supplies' | 'rules' | 'machines'

/** Each fixture table's household rows; spelled out per table because index typing is per table. */
async function householdRows(ctx: MutationCtx, table: FixtureTable, householdId: Id<'households'>): Promise<Array<{ _id: string; fixtureKey?: string }>> {
  switch (table) {
    case 'textiles': return ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    case 'supplies': return ctx.db.query('supplies').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    case 'rules': return ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    case 'machines': return ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
  }
}

async function fixtureRows<Table extends FixtureTable>(ctx: MutationCtx, table: Table, householdId: Id<'households'>): Promise<Map<string, Id<Table>>> {
  const rows = await householdRows(ctx, table, householdId)
  return new Map(rows.flatMap((row) => (typeof row.fixtureKey === 'string' ? [[row.fixtureKey, row._id as Id<Table>]] : [])))
}

function supplyKind(kind: PlannerSupplyKind | undefined) {
  if (kind === 'dispenser') return 'dispensing_device' as const
  if (kind === 'accessory' || kind === 'dryer_sheet' || kind === 'wool_dryer_ball') return kind
  return 'chemical' as const
}

export const seedWasherFixture = mutation({
  args: { householdId: v.id('households'), family: v.optional(v.boolean()), mixed: v.optional(v.boolean()), refreshCatalogFacts: v.optional(v.boolean()) },
  returns: v.object({
    collectionId: v.id('collections'),
    textileIds: v.array(v.id('textiles')),
    supplyIds: v.array(v.id('supplies')),
    machineIds: v.array(v.id('machines')),
    seeded: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!fixturesEnabled()) fail('disabled', 'Fixture seeding is disabled')
    const actor = (await authorize(ctx, 'fixture.seed', { householdId: args.householdId })).actor
    const now = Date.now()
    let seeded = false

    const existingCollection = await ctx.db
      .query('collections')
      .withIndex('by_household', (q) => q.eq('householdId', args.householdId))
      .collect()
    const collection = existingCollection.find((row) => row.name === 'Sanitized invoice fixture')
    const collectionId = collection?._id ?? await ctx.db.insert('collections', {
      householdId: args.householdId,
      ownerPrincipalKey: actor.key,
      name: 'Sanitized invoice fixture',
      createdAt: now,
    })

    const [textileKeys, supplyKeys, ruleKeys, machineKeys] = await Promise.all([
      fixtureRows(ctx, 'textiles', args.householdId),
      fixtureRows(ctx, 'supplies', args.householdId),
      fixtureRows(ctx, 'rules', args.householdId),
      fixtureRows(ctx, 'machines', args.householdId),
    ])

    const textileIds: Id<'textiles'>[] = []
    const wearers = args.family ? await ctx.db.query('wearers').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect() : []
    const family = [wearers.find((wearer) => wearer.principalKey === actor.key), ...wearers.filter((wearer) => wearer.principalKey !== actor.key)].filter((wearer) => wearer !== undefined)
    const names = [...new Set(sanitizedInvoiceGarments.map((garment) => garment.name))]
    // Ready quantities by invoice line; identical packs deliberately contain both states.
    const readyCopies = [2, 1, 2, 1, 1, 1, 0, 1, 1, 0, 1, 2]
    const busy = args.mixed ? await busyTextiles(ctx, args.householdId) : new Map()
    let statesChanged = false
    let catalogChanged = false
    for (const garment of sanitizedInvoiceGarments) {
      const fixtureKey = garment.id!
      const name = typeof garment.name === 'string' ? garment.name : fixtureKey
      const garmentIdentity = fixtureGarmentIdentity(name)
      const catalogCandidate = invoiceCatalogReference(name, garment.color ?? '')
      const kind = fixtureGarmentKind(name)
      const wearerId = family.length === 0 ? undefined : family[names.indexOf(garment.name) % family.length]!._id
      let textileId = textileKeys.get(fixtureKey)
      if (textileId === undefined) {
        seeded = true
        textileId = await ctx.db.insert('textiles', {
          householdId: args.householdId,
          collectionId,
          ownerPrincipalKey: actor.key,
          templateId: name,
          fixtureKey,
          name: garmentIdentity.name,
          identity: { brand: 'AS Colour', ...('styleNumber' in garmentIdentity ? { styleNumber: garmentIdentity.styleNumber } : {}) },
          ...(catalogCandidate === undefined ? {} : { catalogCandidate }),
          ...(wearerId === undefined ? {} : { wearerId }),
          ...(kind === null ? {} : { kind }),
          color: garment.color ?? undefined,
          colorGroup: garment.colorGroup,
          firstWash: garment.firstWash,
          status: 'dirty',
          washCount: 0,
          createdAt: now,
        })
        const baseProvenance = fixtureProvenance(garment.care?.evidence)
        const provenance = { ...baseProvenance, source: `${baseProvenance.source};catalog:${name.split(' ')[0]}:${fixtureCatalogReviewedAt}` }
        await ctx.db.insert('care', {
          householdId: args.householdId,
          textileId,
          material: garment.material ?? undefined,
          washMethod: garment.care?.washMethod === 'machine' ? 'machine' : 'unknown',
          cycle: garment.care?.cycle ?? undefined,
          maxTemperatureC: garment.care?.maxTemperatureC ?? undefined,
          restrictions: [],
          // Sample evidence is always unknown, so sample care always needs confirming.
          status: 'needs_confirmation',
          provenance,
          createdAt: now,
        })
      } else {
        const existing = (await ctx.db.get(textileId))!
        const matchesInvoice = existing.name === name || existing.name === garmentIdentity.name
        const fillStyleNumber = matchesInvoice && (existing.identity?.brand === undefined || existing.identity.brand === 'AS Colour')
          && existing.identity?.styleNumber === undefined && garmentIdentity.styleNumber !== undefined
        const renameInvoiceTitle = args.refreshCatalogFacts && existing.name === name && existing.identity?.brand === 'AS Colour'
          && (existing.identity.styleNumber === undefined || existing.identity.styleNumber === garmentIdentity.styleNumber)
        // Fill only an explicitly refreshed, still-matching fixture. Existing references are historical;
        // a source revision must not silently rewrite them or turn a candidate into verified care.
        if (args.refreshCatalogFacts && existing.catalogCandidate === undefined && catalogCandidate !== undefined
          && matchesInvoice && existing.color === garment.color && existing.identity?.brand === 'AS Colour'
          && existing.identity.styleNumber === garmentIdentity.styleNumber) {
          await ctx.db.patch(textileId, { catalogCandidate })
          seeded = true
        }
        if ((kind !== null && existing.kind === undefined) || existing.identity?.brand === undefined || fillStyleNumber || renameInvoiceTitle) {
          await ctx.db.patch(textileId, {
            ...(kind !== null && existing.kind === undefined ? { kind } : {}),
            ...(existing.identity?.brand === undefined || fillStyleNumber
              ? { identity: { ...existing.identity, ...(existing.identity?.brand === undefined ? { brand: 'AS Colour' } : {}), ...(fillStyleNumber ? { styleNumber: garmentIdentity.styleNumber } : {}) } } : {}),
            ...(renameInvoiceTitle ? { name: garmentIdentity.name } : {}),
          })
          if (renameInvoiceTitle) catalogChanged = true
          seeded = true
        }
        // Explicit refresh only touches the original unconfirmed fixture baseline.
        // Label edits, changed identity, drying facts and real history stay intact.
        if (args.refreshCatalogFacts && matchesInvoice && existing.color === garment.color
          && existing.identity?.brand === 'AS Colour'
          && (existing.identity.styleNumber === undefined || existing.identity.styleNumber === garmentIdentity.styleNumber)) {
          const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId!)).unique()
          if (care?.material === 'cotton' && care.status === 'needs_confirmation'
            && care.provenance.source === 'sanitized-fixture:invoice-care-label' && care.provenance.confidence === 'unknown'
            && care.washMethod === 'machine' && care.cycle === 'normal' && care.maxTemperatureC === 30
            && care.restrictions.length === 0 && care.dryMethod === undefined && care.dryHeat === undefined
            && care.ironSteam === undefined && care.bleach === undefined && garment.material !== 'cotton') {
            await ctx.db.patch(care._id, {
              material: garment.material ?? undefined,
              provenance: { source: `sanitized-fixture:invoice-care-label;catalog:${name.split(' ')[0]}:${fixtureCatalogReviewedAt}`, confidence: 'unknown' },
            })
            catalogChanged = true
            seeded = true
          }
        }
      }
      if (args.mixed && !busy.has(textileId)) {
        const existing = (await ctx.db.get(textileId))!
        const [line, copy] = fixtureKey.split('-').slice(-2)
        const status = Number(copy) <= (readyCopies[Number(line) - 1] ?? 0) ? 'clean' : Number(line) === 7 ? 'needs_refresh' : 'dirty'
        if (existing.trashedAt === undefined && existing.status !== status) {
          await ctx.db.patch(textileId, { status, statusSince: now, soilLevel: undefined, flag: undefined })
          statesChanged = true
          seeded = true
        }
      }
      textileIds.push(textileId)
    }
    const supplyIds: Id<'supplies'>[] = []
    for (const supply of [...ownedWasherSupplies, ...ownedDispensingDevices]) {
      let supplyId = supplyKeys.get(supply.id)
      if (supplyId === undefined) {
        seeded = true
        supplyId = await ctx.db.insert('supplies', {
          householdId: args.householdId,
          ownerPrincipalKey: actor.key,
          fixtureKey: supply.id,
          name: fixtureSupplyName(supply),
          kind: supplyKind(supply.kind),
          ...(supply.kind === 'detergent' ? { use: 'detergent' as const } : {}),
          ...(supply.bleachKind === undefined ? {} : { safety: { bleachKind: supply.bleachKind, incompatibleSupplyIds: [], incompatibleMaterials: [] } }),
          formulation: supply.formulation === undefined || supply.formulation === null
            ? undefined
            : { name: supply.formulation.name, form: supply.formulation.form, highEfficiencyCompatible: supply.formulation.highEfficiencyCompatible },
          provenance: fixtureProvenance(supply.labelEvidence),
          createdAt: now,
        })
      }
      supplyIds.push(supplyId)
      for (const rule of supply.applicationRules ?? []) {
        const existingRuleId = ruleKeys.get(rule.id)
        if (existingRuleId !== undefined) {
          // Correct only the old, untouched sanitizer fixture rule. Never rewrite
          // an owner's chosen dose or checked pack directions from a family page.
          if (args.refreshCatalogFacts && rule.id === 'lysol-rinse-medium-load') {
            const existingRule = await ctx.db.get(existingRuleId)
            const existingSupply = await ctx.db.get(supplyId)
            const expectedDose = fixtureDose(rule)
            if (existingSupply?.name === fixtureSupplyName(supply)
              && existingSupply.provenance.confidence === 'unknown'
              && existingSupply.provenance.source === 'sanitized-fixture:owned-lysol-laundry-sanitizer-label'
              && existingRule?.provenance.confidence === 'unknown'
              && existingRule.provenance.source === 'sanitized-fixture:owned-lysol-laundry-sanitizer-label'
              && existingRule.stage === 'rinse' && existingRule.placement === 'bleach_compartment'
              && existingRule.timing === 'before cycle start' && Object.keys(existingRule.conditions).length === 0
              && existingRule.dose.amount === expectedDose.amount && existingRule.dose.unit === expectedDose.unit
              && existingRule.dose.mark === expectedDose.mark && (existingRule.dose.fractionOfMark ?? 1) === (expectedDose.fractionOfMark ?? 1) && existingRule.dose.measurementCue === expectedDose.measurementCue) {
              await ctx.db.patch(existingRuleId, {
                placement: 'softener_compartment',
                provenance: { source: `sanitized-fixture:owned-lysol-laundry-sanitizer-label;family-research:${fixtureCatalogReviewedAt}`, confidence: 'unknown' },
              })
              catalogChanged = true
              seeded = true
            }
          }
          continue
        }
        seeded = true
        await ctx.db.insert('rules', {
          householdId: args.householdId,
          supplyId,
          fixtureKey: rule.id,
          conditions: fixtureConditions(rule.conditions),
          dose: fixtureDose(rule),
          stage: fixtureStage(rule.stage),
          placement: fixturePlacement(rule),
          timing: rule.timing ?? 'before cycle start',
          provenance: fixtureProvenance(rule.evidence ?? supply.labelEvidence),
          createdAt: now,
        })
      }
    }

    if (statesChanged || catalogChanged) await invalidatePlans(ctx, args.householdId)

    const machineIds: Id<'machines'>[] = []
    for (const group of trialRoomMachines) {
      for (let number = 1; number <= group.count; number += 1) {
        const fixtureKey = `${group.key}-${number}`
        let machineId = machineKeys.get(fixtureKey)
        if (machineId === undefined) {
          seeded = true
          machineId = await ctx.db.insert('machines', {
            householdId: args.householdId,
            fixtureKey,
            name: `${group.name} ${number}`,
            model: group.model,
            applianceType: group.applianceType,
            drumVolume: { amount: group.volume, unit: 'cu_ft' },
            capacityUnits: Math.round(group.volume * 8) / 2,
            capacityConfidence: 'estimated',
            dispensingProfile: group.applianceType === 'tumble_dryer' ? {} : { placements: [...group.placements], evidence: { source: roomMachineEvidence.source, status: roomMachineEvidence.confidence }, evidenceConfidence: roomMachineEvidence.confidence },
            ...(group.applianceType === 'tumble_dryer'
              ? { heatSettings: [
                { heat: 'no_heat' as const, label: 'No Heat' },
                { heat: 'delicate' as const, label: 'Delicates' },
                { heat: 'low' as const, label: 'Low' },
                { heat: 'medium' as const, label: 'Medium' },
                { heat: 'high' as const, label: 'High' },
              ] }
              : {
                ...(group.applianceType === 'front_load_washer' ? { highEfficiency: true } : {}),
                supportedCycles: ['normal'],
              }),
            pool: 'available',
            location: 'shared',
            pricePerStart: group.price,
            cycleProfile: { cycles: { [group.applianceType === 'tumble_dryer' ? 'timed' : 'normal']: { durationMinutes: group.minutes, confidence: roomMachineEvidence.confidence } } },
            provenance: roomMachineEvidence,
            createdAt: now,
          })
        }
        machineIds.push(machineId)
      }
    }
    // An existing disposable household may still have the two old, fictional pool rows.
    for (const fixtureKey of ['speed-queen-top-loader-pool', 'speed-queen-front-loader-pool']) {
      const old = machineKeys.get(fixtureKey)
      if (old !== undefined) await ctx.db.patch(old, { archived: true })
    }
    return { collectionId, textileIds, supplyIds, machineIds, seeded }
  },
})

/** Whether this deployment offers the sample inventory (development only). */
export const available = query({
  args: {},
  returns: v.boolean(),
  handler: async () => fixturesEnabled(),
})
