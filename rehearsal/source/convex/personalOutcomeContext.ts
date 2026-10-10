import { sha256, stableJson, treatmentPhase, markFractionProblem, type LoadPlan, type OutcomeDimension, type OutcomeStage, type PersonalOutcomeContext, type WashGoal } from '@washcloset/planner'
import type { Doc, Id } from './_generated/dataModel'
import { routineCurrent } from './personalRoutineValues'

type Activity = NonNullable<Doc<'washRecords'>['activityContext']>
type Product = Pick<Activity['products'][number], 'supplyId' | 'amount' | 'unit' | 'mark' | 'fractionOfMark' | 'target' | 'approximate' | 'placement' | 'phase'> & {
  context?: Pick<NonNullable<Activity['products'][number]['context']>, 'provenance' | 'formulation' | 'safety' | 'catalogBinding'>
}
const key = (value: unknown) => sha256(stableJson(value))
const finitePositive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0

/** An exact accepted catalog revision or complete variant/market/formulation evidence is required. */
function productRevision(product: Product): string | null {
  const context = product.context
  if (context === undefined || context.provenance.confidence !== 'verified' || context.formulation === undefined) return null
  const binding = context.catalogBinding
  const facts = context.safety?.capabilities ?? []
  const identities = new Set(facts.filter((fact) => fact.variant.trim() && fact.market.trim() && fact.formulationRevision.trim()
    && fact.source.trim() && finitePositive(fact.retrievedAt)).map((fact) => stableJson([fact.variant, fact.market, fact.formulationRevision])))
  if (identities.size > 1 || binding !== undefined && binding.acceptedClaimIds.length === 0) return null
  if (binding === undefined && (facts.length === 0 || identities.size !== 1 || facts.some((fact) => !fact.variant.trim() || !fact.market.trim() || !fact.formulationRevision.trim() || !fact.source.trim() || !finitePositive(fact.retrievedAt)))) return null
  return key({ supplyId: product.supplyId, formulation: context.formulation,
    revision: binding === undefined ? [...identities].sort() : [binding.variantId, binding.revisionId, [...binding.acceptedClaimIds].sort()],
    safety: context.safety === undefined ? null : { ...context.safety,
      capabilities: facts.map(({ retrievedAt: _retrievedAt, ...fact }) => fact).sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      incompatibleMaterials: [...context.safety.incompatibleMaterials].sort(), incompatibleSupplyIds: [...context.safety.incompatibleSupplyIds].sort(),
      ingredients: context.safety.ingredients === undefined ? null : [...context.safety.ingredients].sort() },
  })
}

/** Dryer comparisons reuse the exact-product route boundary without an effectiveness claim. */
export function recordedDryerWashRoute(record: Doc<'washRecords'>): string | null {
  const activity = record.activityContext
  if (activity?.version !== 2 || activity.independentWashId !== record.sessionId || activity.garment?.textileId !== record.textileId) return null
  if (activity.products.some((product) => product.status !== 'confirmed' || productRevision(product) === null
    || !finitePositive(product.amount) || !product.unit?.trim() || !product.placement?.trim() || product.phase === undefined
    || markFractionProblem({ amount: product.amount ?? 0, unit: product.unit ?? '', mark: product.mark, fractionOfMark: product.fractionOfMark }) !== null)) return null
  return key(activity.products.map((product) => [productRevision(product), product.phase, product.amount, product.unit,
    product.mark ?? null, product.fractionOfMark ?? 1, product.placement,
    ...(product.target === undefined && product.approximate !== true ? [] : [{ target: product.target ?? null, approximate: product.approximate === true }]),
  ]).sort((a, b) => stableJson(a).localeCompare(stableJson(b))))
}

type WashFacts = {
  garment?: Activity['garment']; washer?: Pick<NonNullable<Activity['washer']>, 'machineId' | 'provenance' | 'model' | 'highEfficiency' | 'applianceType' | 'capacityUnits' | 'drumVolume'>; load?: Activity['load'];
  products: readonly Product[]; washGoals?: readonly string[]; advice?: Activity['advice'];
  soaks?: Doc<'washRecords'>['soaks']; cycle: string; temperatureC: number | null; minutes?: number
}

/** Shared keys compare specified proposals with actual recorded use without creating a wash record. */
function washContext(activity: WashFacts, supplyId: Id<'supplies'>, dimension: OutcomeDimension, checkedWhen: OutcomeStage, finishingKey: string): PersonalOutcomeContext | null {
  const garment = activity?.garment
  const washer = activity?.washer
  if (garment?.care === undefined || washer === undefined || garment.care.status !== 'confirmed' || !garment.care.material?.trim() || !garment.kind || !garment.color?.trim()
    || garment.soilLevel === undefined || garment.decoration === undefined || garment.decoration.kind === 'unknown'
    || !garment.ownerPrincipalKey || garment.firstWashState === undefined || garment.firstWashState === 'unknown'
    || activity.load === undefined || !finitePositive(activity.load.pieceCount) || !finitePositive(activity.load.bulkUnits)
    || washer.provenance.confidence !== 'verified' || !activity.cycle.trim() || activity.temperatureC === null
    || !Number.isFinite(activity.temperatureC) || !finitePositive(activity.minutes)) return null
  const products = activity.products
  const chosen = products.filter((product) => product.supplyId === supplyId)
  if (chosen.length === 0 || chosen.some((product) => productRevision(product) === null)) return null
  // A partially captured routine cannot support an exact-product effectiveness comparison.
  if (products.some((product) => productRevision(product) === null
    || !finitePositive(product.amount) || !product.unit?.trim() || !product.placement?.trim() || product.phase === undefined
    || markFractionProblem({ amount: product.amount ?? 0, unit: product.unit ?? '', mark: product.mark, fractionOfMark: product.fractionOfMark }) !== null)) return null
  const goals = [...new Set(activity.washGoals ?? [])].sort()
  if (goals.length === 0 || goals.every((goal) => goal === 'ordinary') && garment.observation === undefined && garment.stainReport === undefined) return null
  const routine = garment.personalRoutine
  const doseRoute = (product: Product) => [productRevision(product), product.phase, product.amount, product.unit, product.mark ?? null, product.placement,
    ...(product.fractionOfMark === undefined || product.fractionOfMark === 1 ? [] : [product.fractionOfMark]),
    ...(product.target === undefined && product.approximate !== true ? [] : [{ target: product.target ?? null, approximate: product.approximate === true }])]
  return {
    problemKey: key({ goals, observation: garment.observation === undefined ? null : {
      problem: garment.observation.problem, timing: garment.observation.timing, recurring: garment.observation.recurring }, stain: garment.stainReport ?? null }),
    garmentKey: key({ kind: garment.kind, color: garment.color, colorGroup: garment.colorGroup ?? null,
      identity: garment.identity ?? null, material: garment.care.material, soil: garment.soilLevel,
      firstWashState: garment.firstWashState, dyeRun: garment.dyeRun ?? null,
      care: { ...garment.care, restrictions: [...garment.care.restrictions].sort() }, decoration: {
        kind: garment.decoration.kind, method: garment.decoration.method, manufacturer: garment.decoration.manufacturer,
        source: garment.decoration.source, confidence: garment.decoration.confidence,
        ...(garment.decoration.guidanceSource === undefined ? {} : { guidanceSource: garment.decoration.guidanceSource }),
        ...(garment.decoration.construction === undefined ? {} : { construction: garment.decoration.construction }) } }),
    profileKey: garment.wearerId ?? garment.ownerPrincipalKey,
    routineKey: key({ settings: routine?.settings ?? null, reviewedLabel: routine?.labelHash ?? null,
      missingLabelAccepted: routine?.missingLabelAccepted ?? false,
      advice: (activity.advice ?? []).map((advice) => [advice.advice.tipId, advice.advice.scope, advice.advice.source, advice.advice.policyVersion, advice.status]).sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      products: products.map(doseRoute).sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      soaks: (activity.soaks ?? []).map(({ startedAt: _startedAt, ...soak }) => soak).sort((a, b) => stableJson(a).localeCompare(stableJson(b))) }),
    productRevisionKey: key(chosen.map(productRevision).sort()),
    routeKey: key(chosen.map(doseRoute).sort((a, b) => stableJson(a).localeCompare(stableJson(b)))),
    machineKey: key({ machineId: washer.machineId, model: washer.model ?? null, highEfficiency: washer.highEfficiency ?? null,
      applianceType: washer.applianceType ?? null, capacity: washer.capacityUnits ?? null, volume: washer.drumVolume ?? null,
      cycle: activity.cycle, plannedTemperatureC: activity.temperatureC, displayedMinutes: activity.minutes, load: activity.load }),
    finishingKey,
    dimension, checkedWhen,
  }
}

/** No use is inferred from a planned/skipped step or a marketing/fixture name. */
export function recordedOutcomeContext(record: Doc<'washRecords'>, supplyId: Id<'supplies'>, dimension: OutcomeDimension, checkedWhen: OutcomeStage): PersonalOutcomeContext | null {
  const activity = record.activityContext
  if (activity?.version !== 2 || activity.independentWashId !== record.sessionId || activity.garment?.textileId !== record.textileId
    || activity.products.some((product) => product.status !== 'confirmed')) return null
  const finishing = record.drying.activityContext
  if (checkedWhen !== 'after_wash' && (finishing === undefined || record.drying.outcome === 'queued' || finishing.start.products.length > 0)) return null
  const finishingKey = checkedWhen === 'after_wash' ? 'wash-only' : key({ method: record.drying.method ?? null, heat: record.drying.heat ?? null,
    machine: finishing!.start.machine?.machineId ?? null, model: finishing!.start.machine?.model ?? null,
    load: finishing!.start.load, starts: finishing!.displayedStarts.map((start) => start.minutes ?? null) })
  return washContext({ ...activity, cycle: record.cycle, temperatureC: record.plannedTemperatureC, minutes: activity.cycleMinutesShown, soaks: record.soaks }, supplyId, dimension, checkedWhen, finishingKey)
}

/** Capture the same garment facts for preparation and proposal comparison. */
export function preparedGarmentFacts(textile: Doc<'textiles'>, care: Doc<'care'> | null): NonNullable<Activity['garment']> {
  return { textileId: textile._id, name: textile.name, ownerPrincipalKey: textile.ownerPrincipalKey,
    firstWashState: textile.firstWash === true ? 'unwashed' : textile.firstWash === false || textile.washCount > 0 ? 'washed' : 'unknown',
    ...(textile.dyeRun === undefined ? {} : { dyeRun: textile.dyeRun }),
    ...(textile.decoration === undefined ? {} : { decoration: textile.decoration }),
    ...(textile.adviceReminder === undefined ? {} : { adviceReminder: textile.adviceReminder }),
    ...(textile.personalRoutine === undefined ? {} : { personalRoutine: textile.personalRoutine }),
    ...(textile.color === undefined ? {} : { color: textile.color }),
    ...(textile.colorGroup === undefined ? {} : { colorGroup: textile.colorGroup }),
    ...(textile.kind === undefined ? {} : { kind: textile.kind }),
    ...(textile.wearerId === undefined ? {} : { wearerId: textile.wearerId }),
    ...(textile.soilLevel === undefined ? {} : { soilLevel: textile.soilLevel }),
    ...(textile.flag?.stainReport === undefined ? {} : { stainReport: textile.flag.stainReport }),
    ...(textile.flag?.observation === undefined ? {} : { observation: textile.flag.observation }),
    ...(textile.identity === undefined ? {} : { identity: textile.identity }),
    ...(textile.catalogCandidate === undefined ? {} : { catalogCandidate: textile.catalogCandidate }),
    ...(textile.catalogBinding === undefined ? {} : { catalogBinding: textile.catalogBinding }),
    ...(care === null ? {} : { care: { restrictions: care.restrictions, status: care.status, provenance: care.provenance,
      ...(care.instructions === undefined ? {} : { instructions: care.instructions }),
      ...(care.material === undefined ? {} : { material: care.material }),
      ...(care.washMethod === undefined ? {} : { washMethod: care.washMethod }),
      ...(care.maxTemperatureC === undefined ? {} : { maxTemperatureC: care.maxTemperatureC }) } }),
  }
}

/** A hypothetical specified wash, never recorded use. Unknown execution-dependent facts stay unknown. */
export function proposedOutcomeContext(args: { textile: Doc<'textiles'>; care: Doc<'care'> | null; machine: Doc<'machines'>; load: LoadPlan;
  supplies: readonly Doc<'supplies'>[]; goals: readonly WashGoal[]; supplyId: Id<'supplies'>; dimension: OutcomeDimension; checkedWhen: OutcomeStage }): PersonalOutcomeContext | null {
  const { textile, care, machine, load } = args
  if (load.status !== 'ready' || load.machineId !== machine._id || !load.textileIds.includes(textile._id) || textile.guest === true
    || args.checkedWhen !== 'after_wash' || (load.garmentAdvice?.length ?? 0) > 0
    || textile.personalRoutine !== undefined && !routineCurrent(textile.personalRoutine, care)) return null
  const steps = load.treatments.filter((step) => step.textileId === undefined || step.textileId === textile._id)
  if (steps.some((step) => step.confirmation !== 'confirmed' || step.atMachine !== undefined || step.soak !== undefined)) return null
  const products: Product[] = []
  for (const step of steps) {
    const supply = args.supplies.find((row) => row._id === step.supplyId)
    if (supply === undefined || supply.archived === true || supply.ranOutAt !== undefined) return null
    products.push({ supplyId: supply._id, amount: step.dose.amount, unit: step.dose.unit, ...(step.dose.mark == null ? {} : { mark: step.dose.mark }),
      ...(step.dose.fractionOfMark === undefined ? {} : { fractionOfMark: step.dose.fractionOfMark }),
      ...(step.dose.target === undefined ? {} : { target: step.dose.target }),
      ...(step.dose.approximate === undefined ? {} : { approximate: step.dose.approximate }),
      placement: step.placement, phase: step.textileId === undefined ? treatmentPhase(step, machine) : 'drum', context: { provenance: supply.provenance,
        ...(supply.formulation === undefined ? {} : { formulation: supply.formulation }), ...(supply.safety === undefined ? {} : { safety: supply.safety }),
        ...(supply.catalogBinding === undefined ? {} : { catalogBinding: supply.catalogBinding }) } })
  }
  return washContext({ garment: preparedGarmentFacts(textile, care), products, washGoals: args.goals, advice: [],
    washer: { machineId: machine._id, provenance: machine.provenance,
      ...(machine.model === undefined ? {} : { model: machine.model }), ...(machine.highEfficiency === undefined ? {} : { highEfficiency: machine.highEfficiency }),
      ...(machine.applianceType === undefined ? {} : { applianceType: machine.applianceType }), ...(machine.capacityUnits === undefined ? {} : { capacityUnits: machine.capacityUnits }),
      ...(machine.drumVolume === undefined ? {} : { drumVolume: machine.drumVolume }) },
    load: { pieceCount: load.textileIds.length, bulkUnits: load.bulkUnits, ...(load.soilLevel === null ? {} : { soilLevel: load.soilLevel }) },
    cycle: load.cycle, temperatureC: load.temperatureC, minutes: machine.cycleProfile?.cycles[load.cycle]?.confidence === 'verified' ? machine.cycleProfile.cycles[load.cycle]!.durationMinutes : undefined,
  }, args.supplyId, args.dimension, args.checkedWhen, 'wash-only')
}

/** Negative reports concern comparable wash use even when a later finishing check is incomplete.
 * Preserve their actual assessment timing; this does not turn a later report into wash-only efficacy evidence. */
export function recordedAdverseOutcomeContext(record: Doc<'washRecords'>, supplyId: Id<'supplies'>, dimension: OutcomeDimension, checkedWhen: OutcomeStage): PersonalOutcomeContext | null {
  const context = recordedOutcomeContext(record, supplyId, dimension, 'after_wash')
  if (context === null) return null
  return { ...context, checkedWhen, finishingKey: checkedWhen === 'after_wash' ? context.finishingKey : 'adverse-report-without-finishing-comparison' }
}
