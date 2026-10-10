import type { MachineEvidence, PlannerInput, SupplyItem, TextileEvidence } from './index'
import { invoiceCatalogMaterial } from './fixture-catalog.ts'

const fixtureOwner = 'fixture-household-owner'
const label = (source: string) => ({ status: 'verified' as const, source, revision: 'fixture-v1' })

const invoiceLines: readonly { name: string; color: string; count: number }[] = [
  { name: '5001R Staple Raglan Tee', color: 'White', count: 4 },
  { name: '5009 Ink LS Tee', color: 'Black', count: 2 },
  { name: '5029 Base LS Tee', color: 'Athletic Heather', count: 2 },
  { name: '5029 Base LS Tee', color: 'Navy', count: 2 },
  { name: '5056 General LS Tee', color: 'Athletic Heather', count: 2 },
  { name: "5121 Men's Premium Crew", color: 'Athletic Heather', count: 1 },
  { name: "5121 Men's Premium Crew", color: 'Black', count: 1 },
  { name: '5145 Heavy Crew', color: 'Sand', count: 1 },
  { name: '5910 Court Shorts', color: 'White', count: 2 },
  { name: '5917 Surplus Track Pants', color: 'White', count: 1 },
  { name: '5917 Surplus Track Pants', color: 'White Heather', count: 1 },
  { name: '5001R Staple Raglan Tee', color: 'Black', count: 4 },
]

/** Sanitized replacement for the two invoice PDFs: no addresses, account data, or prices. */
export const sanitizedInvoiceGarments: readonly TextileEvidence[] = invoiceLines.flatMap((line, lineIndex) =>
  Array.from({ length: line.count }, (_, copy) => ({
    id: `invoice-garment-${String(lineIndex + 1).padStart(2, '0')}-${String(copy + 1).padStart(2, '0')}`,
    name: line.name,
    color: line.color,
    colorGroup: line.color.toLowerCase().includes('white') || line.color.includes('Heather') ? 'light' as const : line.color === 'Black' ? 'black' as const : 'dark' as const,
    material: invoiceCatalogMaterial(line.name, line.color),
    ownerId: fixtureOwner,
    firstWash: true,
    status: 'dirty',
    care: { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 30, status: 'confirmed' as const, evidence: label('invoice-care-label') },
  })),
)

/** Names reflect the inventory; pack sizes, numeric doses and marks below are synthetic
 * planner test values. Seeding keeps all product/rule evidence unknown. Research of the
 * product family must never certify these numbers or a household pack/formulation.
 */
export const ownedWasherSupplies: readonly SupplyItem[] = [
  {
    id: 'tide-ultra-concentrate',
    brand: 'Tide',
    product: 'Ultra Concentrate liquid detergent',
    kind: 'detergent',
    bleachKind: 'none',
    formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true },
    package: { revision: 'fixture-v1', amount: 1.36, unit: 'l' },
    measurement: { unit: 'ml', marks: ['line 1', 'line 2'] },
    ownerId: fixtureOwner,
    labelEvidence: label('owned-tide-label'),
    instructionProvenance: label('owned-tide-label'),
    applicationRules: [{ id: 'tide-medium-load', dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, placement: 'detergent_compartment', stage: 'wash', timing: 'before cycle start', evidence: label('owned-tide-label') }],
  },
  {
    id: 'downy-rinse-refresh',
    brand: 'Downy',
    product: 'Rinse & Refresh',
    kind: 'chemical_consumable',
    bleachKind: 'none',
    formulation: { name: 'rinse additive', form: 'liquid' },
    package: { revision: 'fixture-v1', amount: 1, unit: 'l' },
    measurement: { unit: 'ml', marks: ['60 ml'] },
    ownerId: fixtureOwner,
    labelEvidence: label('owned-downy-rinse-refresh-label'),
    instructionProvenance: label('owned-downy-rinse-refresh-label'),
    applicationRules: [{ id: 'downy-rinse-medium-load', dose: { amount: 60, unit: 'ml', measurementCue: 'measure 60 ml' }, placement: 'softener_compartment', stage: 'rinse', timing: 'before cycle start', evidence: label('owned-downy-rinse-refresh-label') }],
  },
  {
    id: 'oxi-laundry',
    brand: 'Oxi',
    product: 'laundry stain remover',
    kind: 'bleach',
    bleachKind: 'oxygen',
    formulation: { name: 'oxygen powder', form: 'powder' },
    package: { revision: 'fixture-v1', amount: 1, unit: 'kg' },
    measurement: { unit: 'g', marks: ['scoop'] },
    ownerId: fixtureOwner,
    labelEvidence: label('owned-oxi-label'),
    instructionProvenance: label('owned-oxi-label'),
    applicationRules: [{ id: 'oxi-medium-load', dose: { amount: 35, unit: 'g', measurementCue: 'one measured scoop' }, placement: 'direct_to_drum', stage: 'wash', timing: 'before loading garments', evidence: label('owned-oxi-label') }],
  },
  {
    id: 'lysol-laundry-sanitizer',
    brand: 'Lysol',
    product: 'Laundry Sanitizer',
    kind: 'sanitizer',
    bleachKind: 'none',
    formulation: { name: 'laundry sanitizer', form: 'liquid' },
    package: { revision: 'fixture-v1', amount: 1, unit: 'l' },
    measurement: { unit: 'ml', marks: ['120 ml'] },
    ownerId: fixtureOwner,
    labelEvidence: label('owned-lysol-laundry-sanitizer-label'),
    instructionProvenance: label('owned-lysol-laundry-sanitizer-label'),
    applicationRules: [{ id: 'lysol-rinse-medium-load', dose: { amount: 120, unit: 'ml', measurementCue: 'measure 120 ml' }, placement: 'softener_compartment', stage: 'rinse', timing: 'before cycle start', evidence: label('owned-lysol-laundry-sanitizer-label') }],
  },
]

/** Reusable equipment is inventory, not a chemical treatment; the wool balls are a dryer product. */
export const ownedDispensingDevices: readonly SupplyItem[] = [
  {
    id: 'downy-ball',
    brand: 'Downy',
    product: 'Downy Ball',
    kind: 'dispenser',
    ownerId: fixtureOwner,
    labelEvidence: label('owned-downy-ball-label'),
  },
  {
    id: 'wool-dryer-balls',
    product: 'wool dryer balls',
    kind: 'wool_dryer_ball',
    ownerId: fixtureOwner,
    labelEvidence: label('owned-wool-dryer-balls-label'),
  },
]

const exactDispensingProfile = {
  compartments: [
    { id: 'detergent_compartment', capacity: 100, capacityUnit: 'ml', release: 'manual' as const, evidence: label('speed-queen-dispensing-label') },
    { id: 'softener_compartment', capacity: 100, capacityUnit: 'ml', release: 'automatic' as const, evidence: label('speed-queen-dispensing-label') },
    { id: 'bleach_compartment', capacity: 150, capacityUnit: 'ml', release: 'automatic' as const, evidence: label('speed-queen-dispensing-label') },
  ],
  directToDrum: true,
  centerAgitator: true,
  automatic: true,
  manual: true,
  downyBall: true,
  release: 'manual' as const,
  requiredCycles: ['normal'],
  evidenceConfidence: 'verified' as const,
  evidence: label('speed-queen-dispensing-label'),
}

export const ownedWasherMachines: readonly MachineEvidence[] = [
  {
    id: 'speed-queen-top-loader-pool',
    name: 'Speed Queen top-loader pool',
    modelId: 'SWNNX2HP115TW01',
    modelNumber: 'SWNNX2HP115TW01',
    applianceType: 'top_load_washer',
    capacityUnits: 8,
    capacityConfidence: 'verified',
    available: true,
    availability: 'available',
    supportedCycles: ['normal'],
    evidence: label('speed-queen-model-label'),
    dispensing: exactDispensingProfile,
  },
  {
    id: 'speed-queen-front-loader-pool',
    name: 'Speed Queen front-loader pool',
    modelId: 'SFNNXRSP115TW07',
    modelNumber: 'SFNNXRSP115TW07',
    applianceType: 'front_load_washer',
    capacityUnits: 8,
    capacityConfidence: 'verified',
    available: true,
    availability: 'available',
    supportedCycles: ['normal'],
    evidence: label('speed-queen-model-label'),
    dispensing: exactDispensingProfile,
  },
]

export const washerPlannerFixture: PlannerInput = {
  textiles: sanitizedInvoiceGarments,
  supplies: ownedWasherSupplies,
  // This named synthetic recipe deliberately exercises all three additions.
  optionalSupplyIds: ['downy-rinse-refresh', 'oxi-laundry', 'lysol-laundry-sanitizer'],
  machines: ownedWasherMachines,
  pricing: { currency: 'USD', washer: { type: 'flat_per_start', price: 2 } },
  preferences: { preferredMachineId: 'speed-queen-front-loader-pool', optimization: 'protect_clothes' },
  policy: { colorPolicy: 'separate_first_wash', requireVerifiedEvidence: true },
}

if (sanitizedInvoiceGarments.length !== 23) throw new Error('Sanitized invoice fixture must contain exactly 23 garments')
