import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'
import { useDirections } from '@washcloset/planner'

import { BottleFields, ProductFormGrid, ProductOverview, bottleDraftProblem, bottleProblemTarget, bottleIntakeSteps, bottleStepProblem, directionSummary, productRecordRows, productRecordView, bottleFieldsFrom, draftFromSupply, newBottleDraft, suggestedBottle, toggleMark, usesFor, withForm, type BottleDraft } from '@/products/bottle-sheet'
import type { Supply } from '@/household/inventory-types'
import { assertPlainCopy } from '@/kit/test-copy'
import { ProductTile, productGroup } from '@/household/household-tiles'
import { designIconPaths } from '@/kit/design-icons'

const supply = (overrides: Partial<Supply> = {}): Supply => ({
  supplyId: 's1' as Supply['supplyId'],
  name: 'Tide Original',
  kind: 'chemical',
  use: 'detergent',
  formulation: { name: 'Tide Original', form: 'liquid' },
  measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: '5' }] },
  archived: false,
  provenance: { source: 'label_taps', confidence: 'observed' },
  rules: [],
  ...overrides,
} as Supply)

const liquid = (patch: Partial<BottleDraft> = {}): BottleDraft => ({ ...withForm(newBottleDraft(), 'liquid'), name: 'Tide Original', use: 'detergent', marks: ['1', '3', '5'], ...patch })

test('product correction routes use validation order and reveal the applicable safety tab', () => {
  expect(bottleProblemTarget(liquid())).toBeNull()
  expect(bottleProblemTarget(newBottleDraft())).toMatchObject({ tab: 'facts', step: 'form' })
  expect(bottleProblemTarget(liquid({ name: '', use: null }))).toMatchObject({ step: 'identity', label: 'Product name' })
  expect(bottleProblemTarget(liquid({ name: '', use: null }), 'purpose')).toMatchObject({ step: 'purpose', label: 'What does it do?' })
  expect(bottleProblemTarget(liquid({ pendingMark: 'half' }))).toMatchObject({ tab: 'directions', step: 'measurement' })
  expect(bottleProblemTarget(liquid({ safety: { bleachKind: 'unknown', incompatibleMaterials: [], incompatibleSupplyIds: [], lipase: { status: 'present', formulation: '', source: '' } } }))).toMatchObject({ tab: 'contents', label: 'Exact variant, market and pack code' })
  expect(bottleProblemTarget(liquid({ use: 'rinse_sanitizer', safety: { bleachKind: 'unknown', incompatibleMaterials: [], incompatibleSupplyIds: [], sanitizing: { route: 'rinse', minimumContactMinutes: 0, formulation: 'Exact pack', source: 'Label' } } }))).toMatchObject({ tab: 'directions', direction: 'sanitizing', label: 'Label’s minimum rinse contact time (minutes)' })
})

test('product intake skips inapplicable questions and saves unrecorded marks without inventing a dose', () => {
  const draft = liquid({ marks: [] })
  expect(bottleIntakeSteps(draft)).toEqual(['form', 'purpose', 'identity', 'measurement', 'review'])
  expect(bottleIntakeSteps(withForm(draft, 'pods'))).toEqual(['form', 'identity', 'review'])
  expect(bottleStepProblem(newBottleDraft(), 'form')).not.toBeNull()
  expect(bottleStepProblem({ ...draft, name: '' }, 'identity')).not.toBeNull()
  expect(bottleStepProblem(draft, 'review')).toBeNull()
  expect(bottleFieldsFrom(draft).measure).toBeUndefined()
  expect(bottleFieldsFrom(draft).safety?.bleachKind).toBe('unknown')
  const html = renderToStaticMarkup(<BottleFields draft={draft} onChange={() => {}} step="measurement" />)
  expect(html).toContain('Not recorded yet')
  expect(html).not.toContain('Product name')
  expect(html).not.toContain('Label warnings')
})

test('product tiles distinguish missing directions from reusable accessories', () => {
  const empty = renderToStaticMarkup(<ProductTile supply={supply()} onOpen={() => {}} />)
  expect(empty).toContain('Add label directions')
  const accessory = renderToStaticMarkup(<ProductTile supply={supply({ kind: 'wool_dryer_ball', use: 'dryer_balls', rules: [] })} onOpen={() => {}} />)
  expect(accessory).toContain('Reusable accessory')
  expect(accessory).not.toContain('Add label directions')
  const unspecified = renderToStaticMarkup(<ProductTile supply={supply({ name: 'Downy Rinse & Refresh', use: null, measure: null })} onOpen={() => {}} />)
  expect(unspecified).toContain('Downy Rinse &amp; Refresh')
  expect(unspecified).toContain('Add label directions')
  expect(unspecified).not.toContain('pile-caret')
})

test('nothing is preset: the form, the name, the use and the marks are each tapped or typed', () => {
  const draft = newBottleDraft()
  expect(draft).toEqual({ form: null, use: null, name: '', marks: [] })
  expect(bottleDraftProblem(draft)).toBe('Tap what it is')
  expect(bottleDraftProblem(withForm(draft, 'liquid'))).toBe('Give it a name')
  expect(bottleDraftProblem({ ...withForm(draft, 'liquid'), name: 'Tide' })).toBe('Tap what it is used for')
  expect(bottleDraftProblem({ ...withForm(draft, 'liquid'), name: 'Tide', use: 'detergent' })).toBeNull()
  expect(bottleDraftProblem({ ...withForm(draft, 'powder'), name: 'Oxi', use: 'booster' })).toBeNull()
  expect(bottleDraftProblem(liquid())).toBeNull()
})

test('an unadded cap mark stays in the draft and blocks advancing or saving', () => {
  const draft = liquid({ pendingMark: 'Line A' })
  expect(bottleStepProblem(draft, 'measurement')).toContain('Add the mark')
  expect(bottleDraftProblem(draft)).toContain('Add the mark')
  expect(withForm(draft, 'powder').pendingMark).toBe('Line A')
  expect(withForm(draft, 'pods').pendingMark).toBeUndefined()
  expect(bottleDraftProblem({ ...draft, pendingMark: undefined })).toBeNull()
})

test('catalog words suggest the product type but never fill printed cap marks', () => {
  expect(suggestedBottle('Tide liquid laundry detergent', [])).toEqual({ form: 'liquid', use: 'detergent' })
  expect(suggestedBottle('Lysol Laundry Sanitizer', ['en:liquid-laundry-products'])).toEqual({ form: 'liquid', use: 'rinse_sanitizer' })
  expect(suggestedBottle('Wool dryer balls', [])).toEqual({ form: 'balls', use: 'dryer_ball' })
  expect(suggestedBottle('Downy Ball', [])).toEqual({ form: 'dispenser', use: null })
  expect(suggestedBottle('Unknown product', ['dryer-balls'])).toEqual({ form: 'balls', use: 'dryer_ball' })
  expect(suggestedBottle('Unknown product', [])).toEqual({ form: null, use: null })
  expect(bottleDraftProblem({ ...newBottleDraft(), ...suggestedBottle('Tide liquid laundry detergent', []), name: 'Tide liquid laundry detergent' })).toBeNull()
})

test('label safety stays unknown until recorded, and edits preserve warnings and pretreatment facts', () => {
  expect(bottleFieldsFrom(liquid({ name: 'Oxygen chlorine bleach' })).safety?.bleachKind).toBe('unknown')
  const safety = { bleachKind: 'none' as const, incompatibleSupplyIds: ['s2' as Supply['supplyId']], incompatibleMaterials: ['silk'], pretreatment: { stainChemistry: 'protease' as const, stainKinds: ['protein' as const], dose: { amount: 10, unit: 'ml' }, timing: 'Test label directions', safeMaterials: ['cotton'] } }
  const saved = supply({ safety })
  expect(bottleFieldsFrom(draftFromSupply(saved), saved).safety).toEqual(safety)
  expect(bottleDraftProblem(liquid({ safety: { ...safety, pretreatment: { ...safety.pretreatment, stainChemistry: undefined } } }))).toContain('chemistry')
  const measuredOnly = liquid({ marks: [], safety })
  expect(bottleDraftProblem(measuredOnly)).toBeNull()
  expect(bottleFieldsFrom(measuredOnly).measure).toBeUndefined()
})

test('pods are a detergent and sheets go in the dryer; neither has marks', () => {
  expect(usesFor('pods')).toEqual(['detergent'])
  expect(usesFor('sheets')).toEqual(['dryer_sheet'])
  expect(usesFor('balls')).toEqual(['dryer_ball'])
  expect(usesFor('dispenser')).toEqual([])
  expect(usesFor('liquid')).toEqual(['detergent', 'booster', 'softener', 'sanitizer', 'rinse_sanitizer'])
  const pods = withForm(liquid({ use: 'softener' }), 'pods')
  expect(pods).toMatchObject({ form: 'pods', use: 'detergent', marks: [] })
  expect(bottleDraftProblem(pods)).toBeNull()
  expect(withForm(liquid({ use: 'booster' }), 'powder')).toMatchObject({ use: 'booster', marks: ['1', '3', '5'] })
  expect(withForm(withForm(liquid(), 'sheets'), 'liquid').use).toBeNull()
  expect(withForm(newBottleDraft(), 'balls')).toMatchObject({ form: 'balls', use: 'dryer_ball', marks: [] })
  expect(bottleDraftProblem({ ...withForm(newBottleDraft(), 'balls'), name: 'Wool dryer balls' })).toBeNull()
  expect(bottleDraftProblem({ ...withForm(newBottleDraft(), 'dispenser'), name: 'Downy Ball' })).toBeNull()
})

test('scent beads only boost scent, keep their cap lines, and are guessed from the name without any chemistry', () => {
  expect(usesFor('beads')).toEqual(['scent_booster'])
  expect(usesFor('liquid')).not.toContain('scent_booster')
  expect(withForm(liquid({ use: 'detergent', marks: ['1'] }), 'beads')).toMatchObject({ form: 'beads', use: 'scent_booster', marks: ['1'] })
  for (const name of ['Downy Unstopables In-Wash Scent Booster Fresh', 'Gain scent beads', 'Purex in-wash scent booster', 'Scent booster']) {
    expect(suggestedBottle(name, [])).toEqual({ form: 'beads', use: 'scent_booster' })
  }
  const beads = { ...withForm(newBottleDraft(), 'beads'), name: 'Downy Unstopables' }
  expect(bottleDraftProblem(beads)).toBeNull()
  const fields = bottleFieldsFrom({ ...beads, marks: ['Full cap'] })
  expect(fields).toMatchObject({ kind: 'chemical', use: 'scent_booster', measure: { kind: 'cap', marks: [{ label: 'Full cap' }] }, formulation: { form: 'beads' } })
  expect(fields.safety?.bleachKind).toBe('unknown')
  expect(fields.safety?.factSource).toBeUndefined()
  const saved = supply({ name: 'Downy Unstopables', use: 'scent_booster', measure: { kind: 'cap', marks: [{ label: 'Full cap' }] }, formulation: { name: 'Downy Unstopables', form: 'beads' } })
  expect(productGroup(saved)).toBe('Scent boosters')
  const row = renderToStaticMarkup(<ProductTile supply={saved} onOpen={() => {}} />)
  expect(row).toContain(designIconPaths.beads)
  expect(row).toContain('Scent beads')
  expect(draftFromSupply(supply({ name: 'Downy Unstopables', use: 'scent_booster', measure: { kind: 'cap', marks: [{ label: 'Full cap' }] }, formulation: { name: 'Downy Unstopables', form: 'beads' } }))).toMatchObject({ form: 'beads', use: 'scent_booster', marks: ['Full cap'] })
})

test('marks are kept exactly as printed, once each, and a tap takes one off', () => {
  expect(toggleMark(['1', '3'], ' Max ')).toEqual(['1', '3', 'Max'])
  expect(toggleMark(['1', 'Max'], 'max')).toEqual(['1'])
  expect(toggleMark(['1'], '  ')).toEqual(['1'])
  expect(toggleMark(['1'], 'Line A')).toEqual(['1', 'Line A'])
})

test('the saved measure is the cap or scoop marks, or a count, and the kind fits what it is for', () => {
  const cap = bottleFieldsFrom(liquid({ marks: ['1', '3', 'Max'] }))
  expect(cap).toMatchObject({ kind: 'chemical', use: 'detergent', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: 'Max' }] }, formulation: { form: 'liquid' } })
  expect(bottleFieldsFrom(liquid({ form: 'powder', use: 'booster' })).measure).toMatchObject({ kind: 'scoop' })
  const pods = bottleFieldsFrom(withForm(liquid(), 'pods'))
  expect(pods).toMatchObject({ kind: 'single_use', use: 'pods', measure: { kind: 'count', countUnit: 'pod' } })
  const sheets = bottleFieldsFrom({ ...withForm(newBottleDraft(), 'sheets'), name: 'Bounce' })
  expect(sheets).toMatchObject({ kind: 'dryer_sheet', use: 'dryer_sheets', measure: { kind: 'count', countUnit: 'sheet' } })
  const balls = bottleFieldsFrom({ ...withForm(newBottleDraft(), 'balls'), name: 'Wool dryer balls' })
  expect(balls).toMatchObject({ kind: 'wool_dryer_ball', use: 'dryer_balls', measure: { kind: 'count', countUnit: 'ball' } })
  expect(bottleFieldsFrom({ ...withForm(newBottleDraft(), 'dispenser'), name: 'Downy Ball' })).toMatchObject({ kind: 'dispensing_device' })
  expect(sheets.formulation).toBeUndefined()
  // The server refuses a kind that does not match the use: every answer must agree with it.
  for (const fields of [cap, pods, sheets, balls, bottleFieldsFrom(liquid({ use: 'softener' })), bottleFieldsFrom(liquid({ use: 'sanitizer' })), bottleFieldsFrom(liquid({ use: 'rinse_sanitizer' }))]) {
    expect(useDirections(fields.use!, []).kind).toBe(fields.kind)
  }
  // Nothing is guessed about how much a mark holds.
  expect(cap.measure!.marks!.every((mark) => mark.amount === undefined && mark.unit === undefined)).toBe(true)
})

test('an edit starts from the bottle as saved and keeps its other formulation words', () => {
  const tide = supply({ formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true } })
  expect(draftFromSupply(tide)).toEqual({ form: 'liquid', use: 'detergent', name: 'Tide Original', marks: ['1', '3', '5'] })
  expect(bottleFieldsFrom(draftFromSupply(tide), tide).formulation).toEqual({ name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true })
  expect(draftFromSupply(supply({ name: 'Bounce', kind: 'dryer_sheet', use: 'dryer_sheets', measure: null, formulation: null }))).toMatchObject({ form: 'sheets', use: 'dryer_sheet', marks: [] })
  expect(draftFromSupply(supply({ name: 'Wool dryer balls', kind: 'wool_dryer_ball', use: 'dryer_balls', measure: { kind: 'count', countUnit: 'ball' }, formulation: null }))).toMatchObject({ form: 'balls', use: 'dryer_ball', marks: [] })
  expect(draftFromSupply(supply({ name: 'Downy Ball', kind: 'dispensing_device', use: null, measure: null, formulation: null }))).toMatchObject({ form: 'dispenser', use: null, marks: [] })
  // An older product with no use, or a use the sheet has no words for, leaves that to a tap.
  expect(draftFromSupply(supply({ use: null, measure: null })).use).toBeNull()
  expect(draftFromSupply(supply({ use: 'stain_remover' })).use).toBeNull()
})

test('the sheet asks in plain words, with the mark chips as big taps', () => {
  const markup = renderToStaticMarkup(<BottleFields draft={liquid({ marks: ['1', 'Line A'] })} onChange={() => undefined} />)
  for (const words of ['Product type', 'Liquid', 'Pods', 'Powder', 'Dryer sheets', 'Dryer balls', 'Dispenser', 'What does it do?', 'Marks on the cap', 'Max', 'Line A', 'Choose the label’s dose when planning a wash.']) expect(markup).toContain(words)
  expect(markup).toMatch(/aria-pressed="true"[^>]*>1<\/button>/)
  expect(markup).toMatch(/aria-pressed="false"[^>]*>2<\/button>/)
  expect(markup).not.toMatch(/evidence|formulation/i)
  expect(markup).toContain('>Contents</button>')
  expect(markup).toContain('role="tab"')
  assertPlainCopy(markup)
  const empty = renderToStaticMarkup(<BottleFields draft={newBottleDraft()} onChange={() => undefined} />)
  expect(empty).not.toContain('What does it do?')
  expect(empty).not.toContain('aria-pressed="true"')
})

test('product type is seven picture tiles named by their labels, with the saved form pressed', () => {
  const markup = renderToStaticMarkup(<ProductFormGrid draft={liquid()} onChange={() => undefined} />)
  expect(markup.match(/<button/g)).toHaveLength(7)
  for (const label of ['Liquid', 'Pods', 'Powder', 'Scent beads', 'Dryer sheets', 'Dryer balls', 'Dispenser']) expect(markup).toContain(`<span>${label}</span>`)
  expect(markup).not.toContain('>Sheets<')
  expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
  expect(markup).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*<span>Liquid<\/span><\/button>/)
  expect(markup.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(7)
  expect(renderToStaticMarkup(<ProductFormGrid draft={newBottleDraft()} onChange={() => undefined} />)).not.toContain('aria-pressed="true"')
})

test('tapping a product type tile applies withForm: marks and an unfit use go, a sole use is taken', () => {
  const picks: BottleDraft[] = []
  const pick = (draft: BottleDraft, form: Parameters<typeof withForm>[1]) => {
    const element = ProductFormGrid({ draft, onChange: (next) => picks.push(next) })
    ;(element.props as { onPick: (value: typeof form) => void }).onPick(form)
    return picks.at(-1)!
  }
  const tide = liquid({ use: 'softener', marks: ['1', '3'] })
  expect(pick(tide, 'pods')).toEqual(withForm(tide, 'pods'))
  expect(pick(tide, 'pods')).toMatchObject({ form: 'pods', use: 'detergent', marks: [] })
  expect(pick(tide, 'powder')).toMatchObject({ form: 'powder', use: 'softener', marks: ['1', '3'] })
  expect(pick(tide, 'sheets')).toMatchObject({ form: 'sheets', use: 'dryer_sheet', marks: [] })
  expect(pick(tide, 'dispenser')).toMatchObject({ form: 'dispenser', use: null, marks: [] })
  for (const form of ['liquid', 'pods', 'powder', 'sheets', 'balls', 'dispenser'] as const) expect(pick(tide, form)).toEqual(withForm(tide, form))
})

test('a rinse sanitizer is its own chip, says it goes in the rinse, and is saved as one', () => {
  const lysol = liquid({ name: 'Lysol Laundry Sanitizer', use: 'rinse_sanitizer', marks: ['1'] })
  const markup = renderToStaticMarkup(<BottleFields draft={lysol} onChange={() => undefined} />)
  expect(markup).toMatch(/aria-pressed="true"[^>]*>Rinse sanitizer<\/button>/)
  expect(markup).toContain('Lysol Laundry Sanitizer: goes in the rinse')
  assertPlainCopy(markup)
  expect(renderToStaticMarkup(<BottleFields draft={liquid()} onChange={() => undefined} />)).not.toContain('goes in the rinse')
  expect(bottleFieldsFrom(lysol)).toMatchObject({ kind: 'chemical', use: 'rinse_sanitizer', measure: { kind: 'cap', marks: [{ label: '1' }] } })
  expect(draftFromSupply(supply({ name: 'Lysol Laundry Sanitizer', use: 'rinse_sanitizer' })).use).toBe('rinse_sanitizer')
})

test('a rinse sanitizing claim needs exact pack and contact evidence and survives editing without an invented default', () => {
  const draft = liquid({ use: 'rinse_sanitizer', marks: ['1'] })
  expect(bottleFieldsFrom(draft).safety?.sanitizing).toBeUndefined()
  const sanitizing = { route: 'rinse' as const, minimumContactMinutes: 16, formulation: 'Synthetic exact pack', source: 'Synthetic label' }
  const safety = { bleachKind: 'none' as const, incompatibleMaterials: [], incompatibleSupplyIds: [], sanitizing }
  const recorded = { ...draft, safety }
  expect(bottleDraftProblem(recorded)).toBeNull()
  expect(bottleFieldsFrom(recorded).safety?.sanitizing).toEqual(sanitizing)
  expect(draftFromSupply(supply({ use: 'rinse_sanitizer', safety })).safety?.sanitizing).toEqual(sanitizing)
  for (const claim of [{ ...sanitizing, minimumContactMinutes: 0 }, { ...sanitizing, formulation: '' }, { ...sanitizing, source: '' }]) {
    expect(bottleDraftProblem({ ...recorded, safety: { ...safety, sanitizing: claim } })).toMatch(/exact pack/)
  }
})

type Rule = Supply['rules'][number]
const rule = (overrides: Partial<Rule> = {}): Rule => ({
  ruleId: 'r1',
  row: null,
  rowText: null,
  dose: { amount: 1, unit: 'cap', mark: '3' },
  stage: 'wash',
  placement: 'detergent_compartment',
  timing: 'before start',
  conditions: {},
  provenance: { source: 'label_taps', confidence: 'observed' },
  incompatibleSupplyIds: [],
  incompatibleMaterials: [],
  ...overrides,
} as unknown as Rule)

test('each record row opens the editor on the section that holds its answer', () => {
  const opened: string[] = []
  const rows = productRecordRows(supply({ safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: ['silk'] } }), (section) => opened.push(section))
  const tap = (tab: keyof typeof rows, name: string) => rows[tab].find(([label]) => label === name)![2]!()
  tap('facts', 'Type')
  tap('facts', 'Cap marks')
  tap('contents', 'Bleach')
  tap('directions', 'Label directions')
  tap('directions', 'Do not use on')
  expect(opened).toEqual(['facts', 'directions', 'contents', 'directions', 'directions'])
})

test('the editor opens on the tapped section, and Cancel or a saved edit return to the same record tab', () => {
  const onDirections = productRecordView({ editing: false, tab: 'facts' }, { kind: 'view', tab: 'directions' })
  const editing = productRecordView(onDirections, { kind: 'edit', section: 'directions', at: 1 })
  expect(editing).toEqual({ editing: true, tab: 'directions', focus: { tab: 'directions', at: 1 } })
  expect(productRecordView(editing, { kind: 'invalid', section: 'facts', at: 2 })).toEqual({ editing: true, tab: 'directions', focus: { tab: 'facts', at: 2 } })
  expect(productRecordView(editing, { kind: 'cancel' })).toEqual({ editing: false, tab: 'directions' })
  // An existing product's Save keeps the sheet open on its record; only a new product closes.
  expect(productRecordView(editing, { kind: 'saved' })).toEqual({ editing: false, tab: 'directions' })
  // Cap marks live on the Facts record tab but are edited beside the directions.
  expect(productRecordView({ editing: false, tab: 'facts' }, { kind: 'edit', section: 'directions', at: 3 })).toMatchObject({ tab: 'facts', focus: { tab: 'directions' } })
  const markup = renderToStaticMarkup(<BottleFields draft={liquid()} onChange={() => undefined} focus={{ tab: 'directions', at: 1 }} />)
  expect(markup).toMatch(/<button[^>]*aria-selected="true"[^>]*>Directions<\/button>/)
})

test('saved directions are read back as rows with dose, placement, timing and source', () => {
  const rules = [
    rule({ rowText: 'Medium load, normal soil' }),
    rule({ ruleId: 'r2' as Rule['ruleId'], dose: { amount: 30, unit: 'ml' }, placement: 'direct_to_drum', timing: '', conditions: { loadSizes: ['small', 'medium'], soilLevels: ['heavy'] }, provenance: { source: 'catalog-directions:abc:def:123', confidence: 'verified' } }),
    rule({ ruleId: 'r3' as Rule['ruleId'], provenance: { source: 'sanitized-fixture:test', confidence: 'unknown' } }),
  ]
  expect(directionSummary(rules[0]!, 'imperial')).toEqual({ heading: 'Medium load, normal soil', dose: 'Fill the cap to 3', placement: 'Detergent compartment · before start', source: 'From your label' })
  expect(directionSummary(rules[1]!, 'metric')).toMatchObject({ heading: 'Small or medium load · Very dirty', placement: 'Directly in the drum', source: 'From source directions' })
  expect(directionSummary(rules[2]!, 'metric')).toMatchObject({ heading: 'Any load', source: 'Recorded' })
  const markup = renderToStaticMarkup(<ProductOverview supply={supply({ rules })} tab="directions" onTab={() => undefined} onEdit={() => undefined} />)
  for (const words of ['Saved directions', 'Medium load, normal soil', 'Fill the cap to 3', 'Detergent compartment · before start', 'From your label', 'From source directions', 'Recorded']) expect(markup).toContain(words)
  expect(markup).not.toContain('3 saved')
  expect(markup).not.toContain('sanitized-fixture')
  expect(markup).not.toContain('Dose not recorded')
  // A cap mark is never turned into a volume the rule did not save.
  expect(directionSummary(rules[0]!, 'imperial').dose).not.toMatch(/about|≈/)
  expect(markup).toMatch(/<button[^>]*aria-selected="true"[^>]*>Directions<\/button>/)
  const empty = renderToStaticMarkup(<ProductOverview supply={supply()} tab="directions" onTab={() => undefined} onEdit={() => undefined} />)
  expect(empty).toContain('Dose not recorded. Check the product label.')
  expect(empty).not.toContain('Saved directions')
  assertPlainCopy(markup)
})
