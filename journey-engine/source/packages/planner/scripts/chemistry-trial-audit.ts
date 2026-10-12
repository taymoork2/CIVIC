// Diagnostic controls, not confirmed owner labels, product packs or physical use.
// Run with --assert to return a failing exit code while expectations remain unmet.
import { plan } from '../src/index.ts'
import { washerPlannerFixture, sanitizedInvoiceGarments, ownedWasherSupplies } from '../src/fixtures.ts'

type Input = Parameters<typeof plan>[0]
type Result = ReturnType<typeof plan>
const detergent = ownedWasherSupplies[0]!
const white = { ...sanitizedInvoiceGarments[0]!, firstWash: false }
const black = { ...sanitizedInvoiceGarments.at(-1)!, firstWash: false }
const base = { ...washerPlannerFixture, textiles: [white, black], supplies: [detergent] }
const cases: Array<Record<string, unknown> & { met: boolean }> = []

function record(name: string, input: Input, expected: string, check: (result: Result) => boolean) {
  const result = plan(input)
  cases.push({ name, expected, met: check(result), status: result.status,
    loads: result.loads.map((load) => ({ pieces: load.textileIds.length, temperatureC: load.temperatureC,
      capacityUnits: load.capacityUnits, loadSize: load.loadSize,
      treatments: load.treatments.map((step) => ({ product: step.supplyId, dose: step.dose,
        stage: step.stage, placement: step.placement, soak: step.soak })) })),
    exclusions: result.exclusions.length,
    blockers: result.reasons.filter((reason) => ['needs_confirmation', 'shared_compartment_conflict', 'product_restriction'].includes(reason.code))
      .map((reason) => ({ code: reason.code, details: reason.details })) })
}

record('confirmed detergent-only invoice', { ...base, textiles: sanitizedInvoiceGarments },
  'Ready; every piece assigned exactly once; no abstract packing-unit overflow', (r) => {
    const ids = r.loads.flatMap((load) => load.textileIds)
    return r.status === 'ready' && ids.length === 23 && new Set(ids).size === 23
      && r.loads.every((load) => load.bulkUnits <= load.capacityUnits)
  })
record('all synthetic owned products', washerPlannerFixture, 'Block conflicting rinse products',
  (r) => r.status !== 'ready' && r.reasons.some((reason) => reason.code === 'shared_compartment_conflict'))
record('first wash colors', { ...base, textiles: [{ ...white, firstWash: true }, { ...black, firstWash: true }] },
  'Separate white and black', (r) => r.loads.length === 2)
record('label with like colors after prior wash', { ...base, textiles: [
  { ...white, care: { ...white.care, restrictions: ['Wash with like colors'] } }, black] },
  'Separate white and black even after prior wash', (r) => r.loads.length === 2)
record('label wash alone', { ...base, textiles: [white,
  { ...white, id: 'alone', care: { ...white.care, restrictions: ['Wash alone'] } }] },
  'Keep the wash-alone piece separate', (r) => r.loads.length === 2)
record('temperature ceiling', { ...base, textiles: [white,
  { ...white, id: 'warm', care: { ...white.care, maxTemperatureC: 40 } }] },
  'Stay at 30 C for the mixed load', (r) => r.loads.every((load) => load.temperatureC === 30))

const soak: NonNullable<Input['supplies']>[number] = {
  id: 'synthetic-soak', kind: 'chemical_consumable', bleachKind: 'none',
  labelEvidence: { status: 'verified' }, formulation: { form: 'liquid' },
  applicationRules: [{ id: 'synthetic-soak-rule', stage: 'prewash', placement: 'manual',
    stainChemistry: 'surfactant', stainKinds: ['oil_grease'], safeMaterials: ['cotton'],
    dose: { amount: 10, unit: 'ml' }, evidence: { status: 'verified' },
    soak: { waterLitres: 2, minimumMinutes: 1, maximumMinutes: 3, maximumTemperatureC: 30, transfer: 'Synthetic transfer' } }],
}
record('label do not soak', { ...base, textiles: [{ ...white,
  care: { ...white.care, restrictions: ['Do not soak'] },
  stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }], supplies: [detergent, soak],
  pretreatmentChoices: [{ textileId: white.id, supplyId: soak.id }] },
  'Do not authorize a soak', (r) => !r.loads.some((load) => load.treatments.some(
    (treatment) => treatment.soak !== undefined && treatment.confirmation === 'confirmed')))

// Synthetic rinse-product control; not permission to put any owned product in a Downy Ball.
record('Downy Ball on HE washer', { ...base,
  machines: [{ ...washerPlannerFixture.machines![1]!, highEfficiency: true }],
  supplies: [detergent, { ...detergent, id: 'synthetic-ball-delivery', kind: 'chemical_consumable', applicationRules: [
    { ...detergent.applicationRules![0]!, stage: 'rinse', placement: 'downy_ball' }] }] },
  'Reject Downy Ball placement in an HE machine even if the fixture profile enables it', (r) => r.status !== 'ready')

const unmet = cases.filter((scenario) => !scenario.met).length
console.log(JSON.stringify({ scope: 'Synthetic fixture controls; no physical fit, dose or pack confirmation',
  summary: { cases: cases.length, met: cases.length - unmet, unmet }, cases }, null, 2))
if (process.argv.includes('--assert') && unmet > 0) process.exitCode = 1
