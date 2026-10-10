import { compileDirections, type DirectionsCell, type DirectionsRow, type SupplyMeasure, type ProductSourceContract } from '@washcloset/planner'

type Mutable<T> = T extends readonly (infer Item)[] ? Mutable<Item>[] : T extends object ? { -readonly [Key in keyof T]: Mutable<T[Key]> } : T

/** These digests bind the adapter to the reviewed packet, not a product name or a later formulation. */
const packetDigests: Record<string, string> = {
  'owner-reference:tide-original-liquid-121108:us': 'adf0e4217a28e817957ef260b9fce2e9eca12ff2729cc6093ce4098cd5706201',
  'owner-reference:downy-rinse-refresh-free-gentle-103111:us': 'eea585c54b87f4abdf564731ee7be9c3dd9ede03083994c3db8b2f0e513e1c23',
  'owner-reference:lysol-crisp-linen-line-1833:us': '4d83979cf1f8f99446e4ba3c26766785d254f5c36cb26dfe6fa2932c8cdaf52c',
  'owner-reference:oxiclean-versatile-free:us': '9ce9b1b9e5cf78b1e939860362ca16279840698aeb4f6f9b929d162713672d30',
  'owner-reference:oxiclean-white-revive-paks:us': '19aa1f8ff4b649d3245ac779b5123c0c8661d831a0e3aa31f7bf8341112e923d',
  'owner-reference:tide-free-gentle-235843:us': '23f6bbe1bef66a35fe02817ce8dce84f4277b4e62c2afaddba0e59dce4a46eea',
  'owner-reference:tide-pods-spring-meadow-032503:us': '8ee8162e37f7c1f36546f6fda1644e75cf41534eeb94416b322a3168e271babf',
}

export function catalogSourceContract(variantKey: string, digest: string): Mutable<ProductSourceContract> | undefined {
  if (packetDigests[variantKey] !== digest) return undefined
  if (variantKey.includes('downy-rinse-refresh')) return { digest, mixing: 'no_bleach_or_liquid_softener', requireColorfastness: true, sourceLoadCategories: ['normal'] }
  if (variantKey.includes('oxiclean-')) return { digest, mixing: 'regular_detergent_only', excludedFibers: ['wool', 'silk', 'leather'], requireKnownMaterial: true, requireColorfastness: true, ...(variantKey.includes('white-revive') ? { requireOrdinaryWashRoute: true } : {}) }
  if (variantKey.includes('tide-free-gentle')) return { digest, requireColorfastness: true }
  if (variantKey.includes('tide-pods-spring-meadow')) return { digest, sourceLoadCategories: ['smaller', 'standard', 'larger'] }
  return undefined
}

/** Enzymes read from each exact SmartLabel ingredient disclosure; none is inferred from a product name. */
const smartLabelEnzymes: Record<string, { readonly gtin: string; readonly updatedOn: string; readonly retrievedOn: string; readonly enzymes: readonly ('protease' | 'amylase')[] }> = {
  'owner-reference:tide-original-liquid-121108:us': { gtin: '00030772121108', updatedOn: '2026-09-08', retrievedOn: '2026-10-07', enzymes: ['protease', 'amylase'] },
  'owner-reference:tide-free-gentle-235843:us': { gtin: '00030772235843', updatedOn: '2025-10-08', retrievedOn: '2026-10-05', enzymes: ['protease', 'amylase'] },
  'owner-reference:tide-pods-spring-meadow-032503:us': { gtin: '00030772032503', updatedOn: '2024-12-28', retrievedOn: '2026-10-05', enzymes: ['protease', 'amylase'] },
}

/** The sourced capability facts a reviewed catalog pack brings with it, so the plan need not ask the owner to read the label. */
export function catalogCapabilities(variantKey: string, digest: string, packIdentifier: string, labelRevision: string) {
  const entry = smartLabelEnzymes[variantKey]
  if (entry === undefined || packetDigests[variantKey] !== digest) return []
  return entry.enzymes.map((kind) => ({
    kind, status: 'present' as const, variant: packIdentifier, market: 'US', formulationRevision: labelRevision,
    source: `https://smartlabel.pg.com/en-us/${entry.gtin}.html (ingredient list lists ${kind === 'protease' ? 'Subtilisin' : 'Amylase'}; source updated ${entry.updatedOn})`,
    retrievedAt: Date.parse(`${entry.retrievedOn}T00:00:00Z`), scope: 'ingredient_disclosure' as const,
  }))
}

export type DirectionTable = {
  measure: Mutable<SupplyMeasure>
  stage: 'wash' | 'rinse'
  placement: 'detergent_compartment' | 'direct_to_drum' | 'softener_compartment'
  timing: string
  rows: Mutable<DirectionsRow>[]
}
export type DirectionOption = {
  id: string
  label: string
  table: DirectionTable | null
  blockers: string[]
}
export type CatalogDirectionDraft = {
  requiredClaimIds: string[]
  missingClaimIds: string[]
  restrictions: { claimId: string; text: string }[]
  limitations: string[]
  options: DirectionOption[]
}
type Claim = { id: string; key: string; value: string | number | boolean | string[] }

const cap = (mark: string, fractionOfMark?: number): Mutable<DirectionsCell> => ({ amount: 1, unit: 'cap', mark, ...(fractionOfMark === undefined ? {} : { fractionOfMark }) })

/** A bounded executable slice; unsupported routes stay visible without supplying a guessed dose. */
export function catalogDirectionDraft(input: { variantKey: string; digest: string; claims: Claim[]; selectedClaimIds: string[] }): CatalogDirectionDraft {
  const restrictions = input.claims.filter((claim) => claim.key === 'restrictions').map((claim) => ({ claimId: claim.id, text: String(claim.value) }))
  const result: CatalogDirectionDraft = { requiredClaimIds: [], missingClaimIds: [], restrictions, limitations: [], options: [] }
  if (packetDigests[input.variantKey] !== input.digest) {
    result.limitations.push('This source revision has no supported directions adapter. Keep manual directions until it is reviewed for application.')
    return result
  }
  const needs = (ids: string[]) => {
    result.requiredClaimIds = [...new Set(['function', 'handling', ...ids, ...restrictions.map((claim) => claim.claimId)])].sort()
    result.missingClaimIds = result.requiredClaimIds.filter((id) => !input.selectedClaimIds.includes(id))
  }
  const table = (measure: DirectionTable['measure'], stage: DirectionTable['stage'], placement: DirectionTable['placement'], timing: string, rows: DirectionTable['rows']): DirectionTable => ({ measure, stage, placement, timing, rows })
  const unresolved = (id: string, label: string, blockers: string[], mapped: DirectionTable | null = null) => result.options.push({ id, label, table: mapped, blockers })
  switch (input.variantKey) {
    case 'owner-reference:tide-free-gentle-235843:us': {
      needs(['directions-main-wash-0'])
      const measure: DirectionTable['measure'] = { kind: 'cap', marks: [{ label: 'Bar 2' }, { label: 'Bar 3' }, { label: 'Bar 5' }] }
      for (const machineClass of ['he', 'standard'] as const) {
        const rows: DirectionTable['rows'] = [
          { rowText: 'Medium · below Bar 2', loadSizes: ['medium'], cells: [{ ...cap('Bar 2'), target: 'below', machineClass }] },
          { rowText: 'Large · just below Bar 3', loadSizes: ['large'], cells: [{ ...cap('Bar 3'), target: 'just_below', machineClass }] },
          ...(machineClass === 'he' ? [{ rowText: 'HE full', loadSizes: ['extra_large' as const], cells: [{ ...cap('Bar 5'), machineClass }] }] : []),
        ]
        result.options.push({ id: `tide-free-gentle-${machineClass}`, label: `${machineClass === 'he' ? 'HE' : 'Standard'} washer · Free & Gentle liquid`, table: table(measure, 'wash', 'direct_to_drum', 'Ordinary fill only; follow care labels and check colorfastness; add detergent before clothes', rows), blockers: [] })
      }
      result.limitations.push('Below Bar 2 and just below Bar 3 are qualitative targets. No fraction or cap volume is established.', 'Small loads, standard full loads and deep-fill amounts remain unspecified.', 'This exact Free & Gentle liquid is separate from Tide Original and all PODS variants.')
      break
    }
    case 'owner-reference:tide-pods-spring-meadow-032503:us': {
      needs(['directions-main-wash-0'])
      result.options.push({ id: 'tide-pods', label: 'Standard Spring Meadow PODS · manufacturer source categories', table: table({ kind: 'count', countUnit: 'pod' }, 'wash', 'direct_to_drum', 'Dry hands; intact pacs directly in drum before clothes; close container; never cut, puncture, open or separate stuck pacs', ['smaller', 'standard', 'larger'].map((category, index) => ({ rowText: `Manufacturer ${category} load`, sourceLoadCategories: [category as 'smaller' | 'standard' | 'larger'], cells: [{ amount: index + 1, unit: 'pod' }] }))), blockers: [] })
      unresolved('tide-pods-treatment', 'PODS presoak or pretreatment', ['No product-specific treatment route is established; never open a pac.'])
      result.limitations.push('The current standard Tide PODS family guide supplies 1 smaller / 2 standard / 3 larger. Select its category separately for each load; no weight or drum-fill threshold is established.', 'This is standard Spring Meadow PODS, not POWER PODS or Free & Gentle PODS. Conflicting owned-pack instructions require review.')
      break
    }
    case 'owner-reference:tide-original-liquid-121108:us': {
      needs(['directions-main-wash-0'])
      const measure: DirectionTable['measure'] = { kind: 'cap', marks: [{ label: 'Bar 1' }, { label: 'Bar 3' }, { label: 'Bar 5' }] }
      // Full in the application's fullness chooser is extra_large. No small or standard-full dose is inferred.
      const rows: DirectionTable['rows'] = [
        { rowText: 'Medium', loadSizes: ['medium'], cells: [cap('Bar 1', 0.8)] },
        { rowText: 'Large', loadSizes: ['large'], cells: [cap('Bar 3', 0.8)] },
      ]
      // Keep HE and standard columns consistent for the compiler; standard-full is deliberately absent.
      const standard = rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, machineClass: 'standard' as const })) }))
      const he = [...rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, machineClass: 'he' as const })) })),
        { rowText: 'HE full', loadSizes: ['extra_large' as const], cells: [{ ...cap('Bar 5'), machineClass: 'he' as const }] }]
      for (const [machine, chosen] of [['he', he], ['standard', standard]] as const) {
        result.options.push({ id: `tide-${machine}`, label: machine === 'he' ? 'HE washer · medium, large and full' : 'Standard washer · medium and large',
          table: table(measure, 'wash', 'direct_to_drum', 'Ordinary fill only; check care label, test colorfastness; add detergent before clothes', [...chosen]), blockers: [] })
      }
      result.limitations.push('No cap volume or mass is established. Four-fifths of a bar stays a native partial mark.', 'Small loads, standard full loads and deep-fill amounts are not specified. These directions cover ordinary fill only.', 'This reference is Tide Original 121108. It does not establish a match to Free & Gentle.')
      break
    }
    case 'owner-reference:lysol-crisp-linen-line-1833:us': {
      needs(['directions-rinse-sanitization-0', 'rinse-minimum-contact'])
      const measure: DirectionTable['measure'] = { kind: 'cap', marks: [{ label: 'Line 1' }, { label: 'Line 2' }] }
      const rows: DirectionTable['rows'] = [{ cells: [{ machineClass: 'he', amount: 2, unit: 'cap', mark: 'Line 2' }, { machineClass: 'standard', amount: 2, unit: 'cap', mark: 'Line 1' }] }]
      result.options.push({ id: 'lysol-rinse', label: 'Rinse sanitization · softener compartment · machine-washable cotton only',
        table: table(measure, 'rinse', 'softener_compartment', 'release during rinse; allow at least 16 minutes before draining', rows), blockers: [] })
      unresolved('lysol-direct-rinse', 'Direct addition during rinse', ['The selected machine must establish the exact release timing and 16-minute release-to-drain contact; manual timing is not represented by this adapter.'])
      unresolved('lysol-presoak', 'Presoak disinfection', ['The 15-minute presoak is a separate water-based treatment; it cannot establish rinse contact. Use the treatment contract, not washer dose rows.'])
      result.limitations.push('The selected source was discontinued in February 2023. Confirm the actual bottle formulation and physical revision; a source product ID alone is not a pack match.', 'No cap-line volume is established. A later EPA label cannot calibrate this bottle.', 'The supported application slice is exact cotton only; blends and other materials remain unresolved.', 'The washer must separately establish at least 16 minutes from release into rinse to drain. Presoak or total-cycle time is insufficient.')
      break
    }
    case 'owner-reference:downy-rinse-refresh-free-gentle-103111:us':
      needs(['directions-rinse-0'])
      result.options.push({ id: 'downy-rinse', label: 'Normal-load rinse aid · approximately ¼ US cup', table: table({ kind: 'amount' }, 'rinse', 'softener_compartment', 'Add usual detergent first; approximately ¼ US cup in fabric-softener dispenser for rinse release', [{ rowText: 'Normal load', sourceLoadCategories: ['normal'], cells: [{ amount: 0.25, unit: 'US_cup', approximate: true }] }]), blockers: [] })
      result.options.push({ id: 'downy-half-dispenser', label: 'Normal-load rinse aid · half the uncalibrated dispenser', table: table({ kind: 'amount' }, 'rinse', 'softener_compartment', 'Add usual detergent first; fill half the fabric-softener dispenser for rinse release; capacity is not calibrated', [{ rowText: 'Normal load', sourceLoadCategories: ['normal'], cells: [{ amount: 0.5, unit: 'dispenser' }] }]), blockers: [] })
      unresolved('downy-direct-rinse', 'Direct addition during rinse', ['The selected machine must establish access and exact rinse timing; no automatic release or Downy Ball permission is inferred.'])
      result.limitations.push('Family maximum-fill guidance is secondary to the exact source, and is not an exact-pack dose.', 'Unknown dispenser capacity and Downy Ball permission remain unresolved. Tough-odor increases have no precise amount.')
      break
    case 'owner-reference:oxiclean-versatile-free:us':
      needs(['directions-main-wash-0'])
      unresolved('oxi-wash', 'Regular wash · scoop Line 1 before clothes', [],
        table({ kind: 'scoop', marks: [{ label: 'Line 1' }] }, 'wash', 'direct_to_drum', 'Test colorfastness; powder before clothes; regular laundry detergent uses its normal route', [{ soilLevels: ['normal'], cells: [{ amount: 1, unit: 'scoop', mark: 'Line 1' }] }]))
      unresolved('oxi-soak', 'Presoak · scoop Lines 2–4 per US gallon', ['A ranged dose, measured water and source-scoped soak duration belong in the treatment contract; no universal six-hour maximum is established.'])
      result.limitations.push('Heavy-soil increases are unquantified. No scoop mass or volume is established.', 'No wool/blends, silk/blends, leather or dry-clean-only fabrics. No chlorine bleach or other household chemicals; regular laundry detergent in wash is the recorded exception.')
      result.limitations.push('This application route permits ordinary laundry detergent alongside this booster. Do not stack boosters; other chemical combinations need reviewed directions.')
      break
    case 'owner-reference:oxiclean-white-revive-paks:us':
      needs(['directions-main-wash-0', 'directions-cold-water-2'])
      unresolved('paks-wash', 'Regular/light soil · one intact Pak before clothes', [],
        table({ kind: 'count', countUnit: 'pod' }, 'wash', 'direct_to_drum', 'Test colorfastness; intact Pak before clothes; detergent uses its normal route', [{ soilLevels: ['light', 'normal'], cells: [{ amount: 1, unit: 'pod' }] }]))
      result.options.push({ id: 'paks-heavy', label: 'Large heavily soiled / HE heavily soiled · two intact Paks', table: table({ kind: 'count', countUnit: 'pod' }, 'wash', 'direct_to_drum', 'Test hidden area for colorfastness; two intact Paks before clothes; regular detergent uses its normal route; never open a Pak', [
        { rowText: 'Large heavily soiled', loadSizes: ['large', 'extra_large'], soilLevels: ['heavy'], cells: [{ amount: 2, unit: 'pod' }] },
      ]), blockers: [] })
      result.options.push({ id: 'paks-he-heavy', label: 'HE heavily soiled · two intact Paks', table: table({ kind: 'count', countUnit: 'pod' }, 'wash', 'direct_to_drum', 'Test hidden area for colorfastness; two intact Paks before clothes; never open a Pak', [{ rowText: 'HE heavily soiled', soilLevels: ['heavy'], cells: [{ machineClass: 'he', amount: 2, unit: 'pod' }] }]), blockers: [] })
      unresolved('paks-soak', 'Pak presoak / cold-water preparation', ['No supported Pak-to-water soak ratio is recorded. Never transfer powder scoops or liquid cap doses; never open a Pak.'])
      result.limitations.push('No wool/blends, silk/blends, leather or dry-clean-only fabrics. Use only colorfast washable laundry.', 'Cold-water preparation remains source-scoped and must respect garment limits; no temperature permission is inferred.')
      result.limitations.push('This application route permits ordinary laundry detergent alongside this booster. Do not stack boosters; other chemical combinations need reviewed directions.')
      result.limitations.push('For each load, check that the selected washer/program uses the intact-Pak warm/hot in-wash route. Cold-water pre-dissolution and soaking remain unsupported. No numerical cold-water threshold or garment temperature permission is inferred.')
      break
  }
  // Every mapped route still uses the existing directions compiler, including refused previews.
  for (const option of result.options) {
    if (option.table === null) continue
    const compiled = compileDirections(option.table, 'chemical')
    if (!compiled.ok) option.blockers.push(compiled.error)
  }
  return result
}
