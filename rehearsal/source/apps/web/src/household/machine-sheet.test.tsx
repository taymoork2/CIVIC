import { renderToStaticMarkup, renderWithConvex } from '@/test/markup'
import { expect, test } from 'vitest'

import type { Machine } from '@/household/inventory-types'
import { MachineFields, MachineSheet, draftFromGroup, machineDraftProblem, machineProblemTarget, machineFieldsFrom, machineGroupLine, machineGroups, machineIntakeSteps, machineStepProblem, newMachineDraft, type MachineDraft } from '@/household/machine-sheet'
import { assertPlainCopy } from '@/kit/test-copy'
import { MachineTile } from '@/household/household-tiles'

let next = 0
test('appliance intake branches without making optional evidence a setup requirement', () => {
  const initial = newMachineDraft({ place: 'home' })
  expect(machineIntakeSteps(initial)).toEqual(['type', 'controls', 'identity', 'review'])
  expect(machineStepProblem(initial, 'type')).not.toBeNull()
  const washer = { ...initial, kind: 'washer' as const, name: 'Washer' }
  expect(machineStepProblem(washer, 'type')).toBeNull()
  expect(machineStepProblem(washer, 'controls')).not.toBeNull()
  expect(machineStepProblem({ ...washer, door: 'front' }, 'review')).toBeNull()
  expect(machineIntakeSteps({ ...initial, kind: 'hanging' })).toEqual(['type', 'identity', 'review'])
  const html = renderToStaticMarkup(<MachineFields draft={washer} editing={false} section="controls" onChange={() => {}} />)
  expect(html).toContain('Door')
  expect(html).not.toContain('Rinse contact')
  expect(html).not.toContain('Number or label')
})
const machine = (overrides: Partial<Machine> = {}): Machine => ({
  machineId: `m${(next += 1)}` as Machine['machineId'],
  name: 'Washer',
  model: null,
  applianceType: 'front_load_washer',
  highEfficiency: null,
  heatSettings: [],
  capacityUnits: null,
  capacityConfidence: 'unknown',
  supportedCycles: ['normal'],
  placements: ['direct_to_drum'],
  cycleMinutes: {},
  availability: 'available',
  location: 'shared',
  pricePerStart: null,
  drumVolume: null,
  archived: false,
  provenance: { source: 'machine_taps', confidence: 'observed' },
  ...overrides,
} as Machine)

const ready = (patch: Partial<MachineDraft> = {}): MachineDraft => ({ ...newMachineDraft({ place: 'shared', kind: 'washer' }), door: 'front', ...patch })

test('machine correction targets follow validation order, including hidden optional evidence', () => {
  expect(machineProblemTarget(ready())).toBeNull()
  expect(machineProblemTarget(newMachineDraft())).toMatchObject({ section: 'type', label: 'Where is it?' })
  expect(machineProblemTarget(ready({ name: '', minutes: '0' }))).toMatchObject({ section: 'identity', label: 'Number or label as printed' })
  expect(machineProblemTarget(ready({ minutes: '0' }))).toMatchObject({ section: 'cycle', label: 'Minutes for a normal wash' })
  expect(machineProblemTarget(ready({ volume: '99' }))).toMatchObject({ section: 'specifications' })
  expect(machineProblemTarget(ready({ washProcesses: { delicate: { source: '', programLabel: 'Delicates' } } }))).toMatchObject({ section: 'programs', label: 'Where these settings were checked', occurrence: 0 })
  expect(machineProblemTarget(ready({ rinseContact: { normal: { minutes: 16, placement: 'center_agitator', source: '' } } }))).toMatchObject({ section: 'contact', label: 'Where the program contact time was checked' })
  expect(machineProblemTarget(ready({ rinseContact: { normal: { minutes: 16, placement: '', source: 'Manual' } } }))).toMatchObject({ section: 'contact', label: 'Sanitizer release used for this contact time' })
  expect(machineProblemTarget(ready({ rinseContact: { normal: { minutes: 16, placement: 'direct_to_drum', source: 'Manual' } } }))).toMatchObject({ section: 'contact', label: 'By-hand addition timing from the directions' })
})

test('checked process settings round trip separately from timers and separate machines with different configurations', () => {
  const process = { source: 'Synthetic exact manual', programLabel: 'Delicates with Extra Rinse', extraRinses: 1, rinseTemperatureC: 20, spinRpm: 400, maximumFillFraction: 0.5 }
  const first = machine({ name: 'Washer 1', washProcesses: { delicate: process } })
  const second = machine({ name: 'Washer 2', washProcesses: { delicate: { ...process, spinRpm: 800 } } })
  expect(machineGroups([first, second])).toHaveLength(2)
  const draft = draftFromGroup(machineGroups([first])[0]!)
  expect(machineFieldsFrom(draft, first)).toMatchObject({ washProcesses: { delicate: process }, supportedCycles: ['normal', 'delicate'] })
  expect(machineDraftProblem(draft)).toBeNull()
  expect(machineFieldsFrom(ready({ minutes: '40' }))).not.toHaveProperty('washProcesses')
  expect(machineDraftProblem({ ...draft, washProcesses: { delicate: { ...process, source: '' } } })).not.toBeNull()
  expect(machineDraftProblem({ ...draft, washProcesses: { delicate: { ...process, extraRinses: 1.5 } } })).not.toBeNull()
  expect(machineFieldsFrom({ ...draft, washProcesses: {} }, first).washProcesses).toEqual({})
})

test('documented phase minutes round trip with their exact program/source and never come from total minutes', () => {
  const process = { source: 'Synthetic exact model phase table', programLabel: 'Short Wash / No Spin', washMinutes: 10, spinRpm: 0 }
  const first = machine({ name: 'Washer 1', washProcesses: { normal: process }, cycleMinutes: { normal: { durationMinutes: 40, confidence: 'observed' } } })
  const draft = draftFromGroup(machineGroups([first])[0]!)
  expect(machineFieldsFrom(draft, first)).toMatchObject({ washProcesses: { normal: process }, cycleMinutes: { normal: 40 } })
  expect(machineFieldsFrom({ ...draft, minutes: '1' }, first).washProcesses?.normal).toEqual(process)
  for (const washMinutes of [0, -1, Number.NaN, Infinity, 301]) expect(machineDraftProblem({ ...draft, washProcesses: { normal: { ...process, washMinutes } } })).not.toBeNull()
  expect(machineDraftProblem({ ...draft, washProcesses: { normal: { ...process, washMinutes: 0.5 } } })).toBeNull()
  expect(machineDraftProblem({ ...draft, washProcesses: { normal: { ...process, washMinutes: undefined } } })).toBeNull()
  const second = machine({ name: 'Washer 2', washProcesses: { normal: { ...process, washMinutes: 20 } } })
  expect(machineGroups([first, second])).toHaveLength(2)
  expect(machineFieldsFrom(ready({ minutes: '10' }))).not.toHaveProperty('washProcesses')
})

test('checked dryer modes round trip and distinguish otherwise identical machines', () => {
  const first = machine({ name: 'Dryer 1', applianceType: 'tumble_dryer', cycleMinutes: { timed: { durationMinutes: 45, confidence: 'observed', mode: 'sensor' } } })
  const second = machine({ ...first, machineId: 'different' as Machine['machineId'], name: 'Dryer 2', cycleMinutes: { timed: { durationMinutes: 45, confidence: 'observed', mode: 'fixed' } } })
  expect(machineGroups([first, second])).toHaveLength(2)
  const draft = draftFromGroup(machineGroups([first])[0]!)
  expect(machineFieldsFrom(draft, first)).toMatchObject({ cycleMinutes: { timed: 45 }, cycleModes: { timed: 'sensor' } })
  expect(machineFieldsFrom({ ...draft, minutes: '' }, first)).not.toHaveProperty('cycleModes')
  expect(machineFieldsFrom({ ...draft, model: 'New identity', minutes: '', programMode: 'unknown' }, first).cycleMinutes).toEqual({})
  expect(machineFieldsFrom(ready({ kind: 'dryer', minutes: '45' })).cycleModes).toEqual({ timed: 'unknown' })
})

test('mechanical process evidence starts unknown and round trips independently of program name and numeric settings', () => {
  const numeric = { source: 'Synthetic exact manual', programLabel: 'Delicates', extraRinses: 2, spinRpm: 400 }
  const missing = ready({ washProcesses: { delicate: numeric } })
  expect(machineFieldsFrom(missing).washProcesses?.delicate).not.toHaveProperty('mechanicalSeverity')
  for (const mechanicalSeverity of ['normal', 'mild', 'very_mild'] as const) {
    const first = machine({ name: 'Washer 1', washProcesses: { delicate: { ...numeric, mechanicalSeverity } } })
    const draft = draftFromGroup(machineGroups([first])[0]!)
    expect(machineFieldsFrom(draft, first).washProcesses?.delicate).toEqual({ ...numeric, mechanicalSeverity })
    expect(machineDraftProblem(draft)).toBeNull()
    const second = machine({ name: 'Washer 2', washProcesses: { delicate: numeric } })
    expect(machineGroups([first, second])).toHaveLength(2)
  }
  expect(machineFieldsFrom({ ...missing, washProcesses: { delicate: { ...numeric, mechanicalSeverity: undefined } } }).washProcesses?.delicate).toMatchObject(numeric)
})

test('machine tiles summarize common recorded settings without applying one sibling’s facts to all', () => {
  const first = machine({ name: 'Washer 1', highEfficiency: true, cycleMinutes: { normal: { durationMinutes: 35, confidence: 'observed' } } })
  const group = { key: 'washers', name: 'Washer', machines: [first, { ...first, name: 'Washer 2' }] }
  const markup = renderToStaticMarkup(<MachineTile group={group} currency="USD" onOpen={() => {}} />)
  expect(markup).toContain('Washer ×2')
  expect(markup).toContain('HE')
  expect(markup).toContain('Front-loading')
  expect(markup).toContain('Capacity not recorded')
  expect(markup).not.toContain('pile-caret')
  const mixed = renderToStaticMarkup(<MachineTile group={{ ...group, machines: [first, { ...first, highEfficiency: null, cycleMinutes: {} }] }} currency="USD" onOpen={() => {}} />)
  expect(mixed).toContain('HE varies')
  expect(mixed).not.toContain('35 min')
  expect(mixed).toContain('Capacity not recorded')
  const prices = renderToStaticMarkup(<MachineTile group={{ ...group, machines: [{ ...first, pricePerStart: 2 }, { ...first, pricePerStart: 3 }] }} currency="USD" onOpen={() => {}} />)
  expect(prices).not.toContain('$2.00')
  expect(prices).not.toContain('$3.00')
})

test('identical machines group while different prices and capacities stay distinguishable', () => {
  const washers = [1, 2, 3, 4].map((n) => machine({ name: `Speed Queen washer ${n}`, pricePerStart: 2.5, highEfficiency: true }))
  const dryers = [1, 2].map((n) => machine({ name: `Speed Queen dryer ${n}`, applianceType: 'tumble_dryer', pricePerStart: 2 }))
  const home = machine({ name: 'Washer', location: 'home', pricePerStart: 9 })
  const groups = machineGroups([...washers, home, ...dryers])
  expect(groups.map((group) => [group.name, group.machines.length])).toEqual([['Speed Queen washer', 4], ['Washer', 1], ['Speed Queen dryer', 2]])
  expect(machineGroupLine(groups[0]!)).toEqual({ title: 'Speed Queen washer ×4', meta: 'Shared · $2.50' })
  // A home machine never shows a price.
  expect(machineGroupLine(groups[1]!)).toEqual({ title: 'Washer', meta: 'At home' })
  // Different prices stay on separate, editable machine rows.
  const mixed = machineGroups([machine({ name: 'Dryer 1', applianceType: 'tumble_dryer', pricePerStart: 2 }), machine({ name: 'Dryer 2', applianceType: 'tumble_dryer', pricePerStart: 2.25 })])
  expect(mixed.map((group) => machineGroupLine(group))).toEqual([
    { title: 'Dryer 1', meta: 'Shared · $2.00' },
    { title: 'Dryer 2', meta: 'Shared · $2.25' },
  ])
  expect(machineGroups([machine({ name: 'Dryer 1', capacityUnits: 7 }), machine({ name: 'Dryer 2', capacityUnits: 2 })])).toHaveLength(2)
  // The same name in two places is two groups.
  expect(machineGroups([machine({ name: 'W 1', location: 'home' }), machine({ name: 'W 2' })])).toHaveLength(2)
})

test('the sheet saves only once where, what, the door and a name are tapped or typed; nothing is preset', () => {
  const blank = newMachineDraft()
  expect(blank).toMatchObject({ place: null, kind: null, door: null, he: null, count: 1 })
  expect(machineDraftProblem(blank)).toBe('Tap where it is')
  expect(machineDraftProblem({ ...blank, place: 'shared' })).toBe('Tap washer or dryer')
  expect(machineDraftProblem({ ...blank, place: 'shared', kind: 'washer', name: 'Washer' })).toBe('Tap the door it has')
  expect(machineDraftProblem(ready({ name: ' ' }))).toBe('Give it a name')
  expect(machineDraftProblem(ready({ price: 'two' }))).toBe('A price is between $0.01 and $100')
  expect(machineDraftProblem(ready({ minutes: '0' }))).toBe('Minutes are between 1 and 300')
  expect(machineDraftProblem(ready({ price: '$2.50', minutes: '34' }))).toBeNull()
  // A dryer has no door to tap; a home machine has no price to check.
  expect(machineDraftProblem({ ...newMachineDraft({ place: 'home', kind: 'dryer' }), price: 'x' })).toBeNull()
})

test('the answers become the machine calls: HE by the logo, slots plus the drum, price only when shared, minutes only when known', () => {
  expect(machineFieldsFrom(ready({ he: 'yes', slots: ['detergent_compartment'], price: '$2.50', minutes: '34' }))).toEqual({
    location: 'shared', applianceType: 'front_load_washer', highEfficiency: true, placements: ['detergent_compartment', 'direct_to_drum'],
    supportedCycles: ['normal'], pricePerStart: 2.5, cycleMinutes: { normal: 34 }, provenance: { source: 'machine_taps', confidence: 'observed' },
  })
  // "Not sure" and no answer leave HE unrecorded; no minutes are guessed.
  expect(machineFieldsFrom(ready({ he: 'not_sure', door: 'top' }))).toMatchObject({ applianceType: 'top_load_washer', highEfficiency: null })
  expect(machineFieldsFrom(ready())).not.toHaveProperty('cycleMinutes')
  expect(machineFieldsFrom(ready({ place: 'home', price: '3' }))).not.toHaveProperty('pricePerStart')
  // A dryer: its buttons in its own words, coolest first; empty heats are not buttons. No HE, no slots.
  const dryer = { ...newMachineDraft({ place: 'shared', kind: 'dryer' }), minutes: '30', heat: { no_heat: '', delicate: 'Delicates', low: '', medium: '', high: ' Cottons ' } }
  // A button's temperature is never typed or sent: the planner reads it from the model's spec sheet.
  const withLow = { ...dryer, heat: { ...dryer.heat, low: 'Low' } }
  const buttons = [{ heat: 'delicate', label: 'Delicates' }, { heat: 'low', label: 'Low' }, { heat: 'high', label: 'Cottons' }]
  expect(machineFieldsFrom(withLow).heatSettings).toEqual(buttons)
  expect(machineFieldsFrom({ ...withLow, heatTemp: { low: '145' } } as never).heatSettings, 'a stale temperature field is ignored').toEqual(buttons)
  const stored = machine({ name: 'Dryer', applianceType: 'tumble_dryer', heatSettings: [{ heat: 'low', label: 'Low', tempF: 100 }] })
  expect(machineFieldsFrom(draftFromGroup(machineGroups([stored])[0]!), stored).heatSettings, 'a stored temperature is dropped on edit').toEqual([{ heat: 'low', label: 'Low' }])
  expect(machineFieldsFrom(dryer)).toEqual({
    location: 'shared', applianceType: 'tumble_dryer', heatSettings: [{ heat: 'delicate', label: 'Delicates' }, { heat: 'high', label: 'Cottons' }],
    cycleMinutes: { timed: 30 }, cycleModes: { timed: 'unknown' }, provenance: { source: 'machine_taps', confidence: 'observed' },
  })
})

test('editing a group starts from its first machine, keeps other cycles, and can clear the minutes', () => {
  const first = machine({ name: 'SQ 1', highEfficiency: false, placements: ['softener_compartment', 'direct_to_drum'], pricePerStart: 2.5, cycleMinutes: { normal: { durationMinutes: 34, confidence: 'observed' }, delicate: { durationMinutes: 28, confidence: 'observed' } } as never })
  const [group] = machineGroups([first, { ...first, machineId: 'sibling' as Machine['machineId'], name: 'SQ 2' }])
  const draft = draftFromGroup(group!)
  expect(draft).toMatchObject({ place: 'shared', kind: 'washer', door: 'front', he: 'no', slots: ['softener_compartment'], price: '2.5', minutes: '34', name: 'SQ', named: true, count: 2 })
  expect(machineFieldsFrom({ ...draft, minutes: '' }, first).cycleMinutes).toEqual({ delicate: 28 })
  expect(machineFieldsFrom(draft, first)).not.toHaveProperty('supportedCycles')
})

test('program contact evidence stays separate from whole-cycle minutes and unqualified siblings', () => {
  expect(machineFieldsFrom(ready({ minutes: '40' }))).not.toHaveProperty('rinseContact')
  const contact = { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic release-to-drain observation' } }
  const first = machine({ name: 'Washer 1', rinseContact: contact })
  const short = machine({ name: 'Washer 2', rinseContact: { normal: { minutes: 5, placement: 'softener_compartment', source: 'Synthetic observation' } } })
  expect(machineGroups([first, short])).toHaveLength(2)
  const draft = draftFromGroup(machineGroups([first])[0]!)
  expect(machineFieldsFrom(draft, first).rinseContact).toEqual(contact)
  expect(machineDraftProblem({ ...draft, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: '' } } })).not.toBeNull()
  expect(machineDraftProblem({ ...draft, rinseContact: { normal: { minutes: 0, placement: 'softener_compartment', source: 'Synthetic observation' } } })).not.toBeNull()
  expect(machineDraftProblem(draft)).toBeNull()
  expect(machineFieldsFrom({ ...draft, rinseContact: {} }, first).rinseContact).toEqual({})
})

test('incomplete optional washer evidence can be cleared and never blocks a dryer', () => {
  const incomplete = ready({ rinseContact: { normal: { minutes: 16, placement: 'center_agitator', source: '' } }, washProcesses: { normal: { programLabel: 'Normal', source: '' } } })
  expect(machineDraftProblem(incomplete)).not.toBeNull()
  expect(machineDraftProblem({ ...incomplete, washProcesses: {} })).toContain('clear this optional record')
  expect(machineDraftProblem({ ...incomplete, rinseContact: {}, washProcesses: {} })).toBeNull()
  for (const kind of ['dryer', 'hanging'] as const) {
    expect(machineDraftProblem({ ...incomplete, kind })).toBeNull()
    expect(machineFieldsFrom({ ...incomplete, kind })).not.toHaveProperty('rinseContact')
    expect(machineFieldsFrom({ ...incomplete, kind })).not.toHaveProperty('washProcesses')
  }
  const markup = renderToStaticMarkup(<MachineFields draft={{ ...incomplete, washProcesses: {} }} editing={false} onChange={() => undefined} />)
  expect(markup).toContain('Clear rinse contact time')
})

test('the sheet reads plainly: the logo is a picture and specifications are a named section', () => {
  const washer = renderToStaticMarkup(<MachineFields draft={ready({ count: 4, name: 'Speed Queen washer' })} editing={false} onChange={() => undefined} />)
  expect(washer).toContain('Do you see this logo on it?')
  expect(washer).toContain('aria-label="high-efficiency logo"')
  expect(washer).toContain('Price per start')
  expect(washer).toContain('Minutes for a normal wash')
  expect(washer).toContain('How many like it?')
  expect(washer).toContain('Adds Speed Queen washer 1 to 4.')
  expect(washer).not.toContain('How sure')
  expect(washer).toMatch(/<legend[^>]*>Model and drum size<\/legend>/)
  expect(washer).toContain('Drum size in cu. ft.')
  assertPlainCopy(washer)
  const dryer = renderToStaticMarkup(<MachineFields draft={newMachineDraft({ place: 'home', kind: 'dryer' })} editing onChange={() => undefined} />)
  expect(dryer).toContain('What do the heat buttons say?')
  expect(dryer).toContain('Minutes one start gives')
  expect(dryer).toContain('Without one button, loads won’t use this dryer.')
  // At home there is no price; when editing, the kind and the count are fixed.
  expect(dryer).not.toContain('Price per start')
  expect(dryer).not.toContain('What is it?')
  expect(dryer).not.toContain('How many like it?')
  expect(dryer).not.toContain('logo')
  assertPlainCopy(dryer)
})

test('the plan\'s washer opens at where it is and its door; the rest folds behind one disclosure and still saves', () => {
  const draft = newMachineDraft({ place: 'home', kind: 'washer' })
  const required = renderToStaticMarkup(<MachineFields draft={draft} editing={false} ask="required" onChange={() => undefined} />)
  expect(required).toContain('Where is it?')
  expect(required).toContain('Washer or dryer?')
  // One kind of place: the household's answer is used and the question is not asked.
  expect(renderToStaticMarkup(<MachineFields draft={draft} editing={false} ask="required" placeKnown onChange={() => undefined} />)).not.toContain('Where is it?')
  expect(required).toContain('>Door<')
  // The optional questions are still in the sheet, folded after the door: the logo, the minutes, the name.
  expect(required).toMatch(/>Door<[\s\S]*aria-expanded="false"[^>]*>Washer details \(optional\)<[\s\S]*hidden=""[\s\S]*Do you see this logo on it\?[\s\S]*How many like it\?/)
  assertPlainCopy(required)
  // Validation is the same as the full sheet: the door is the one answer missing.
  expect(machineDraftProblem(draft)).toBe('Tap the door it has')
  expect(machineDraftProblem({ ...draft, door: 'front' })).toBeNull()
  const sheet = renderWithConvex(<MachineSheet householdId="h1" kind="washer" ask="required" place="home" onClose={() => undefined} />)
  // The known place and appliance kind do not need another question or a header explanation.
  expect(sheet).toContain('Front or top loading?')
  expect(sheet).not.toContain('Washer or dryer?')
  expect(sheet).not.toContain('Washer details (optional)')
  expect(sheet).toContain('Form progress')
  expect(sheet).toContain('disabled="">Next')
})

test('saved appliance location remains editable when the household supplies its default place', () => {
  for (const place of ['home', 'shared'] as const) for (const kind of ['washer', 'dryer', 'hanging'] as const) {
    const draft = newMachineDraft({ place, kind })
    for (const section of ['type', undefined] as const) {
      const html = renderToStaticMarkup(<MachineFields draft={draft} editing placeKnown section={section} onChange={() => undefined} />)
      expect(html).toContain('Where is it?')
      expect(html).toContain('At home')
      expect(html).toContain('Shared room')
    }
    expect(renderToStaticMarkup(<MachineFields draft={draft} editing={false} placeKnown section="type" onChange={() => undefined} />)).not.toContain('Where is it?')
  }
})

test('specifications and checked evidence render directly in their editor sections', () => {
  const draft = draftFromGroup(machineGroups([machine({ name: 'Washer', location: 'home' })])[0]!)
  for (const focusField of ['capacity', 'model'] as const) {
    const html = renderToStaticMarkup(<MachineFields draft={draft} editing section="specifications" focusField={focusField} onChange={() => undefined} />)
    expect(html).toMatch(/<legend[^>]*>Model and drum size<\/legend>/)
    expect(html).toContain('Model number')
    expect(html).toContain('Drum size in cu. ft.')
    expect(html).not.toContain('aria-expanded')
  }
  for (const section of ['programs', 'contact'] as const) {
    const html = renderToStaticMarkup(<MachineFields draft={draft} editing section={section} onChange={() => undefined} />)
    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('hidden=""')
  }
  const washer = renderToStaticMarkup(<MachineFields draft={draft} editing onChange={() => undefined} />)
  expect(washer).toContain('>Sanitizer</button>')
  for (const kind of ['dryer', 'hanging'] as const) {
    const html = renderToStaticMarkup(<MachineFields draft={newMachineDraft({ kind, place: 'home' })} editing onChange={() => undefined} />)
    expect(html).not.toContain('>Sanitizer</button>')
  }
})

test('existing appliances open at their facts with direct optional detail entries', () => {
  const [group] = machineGroups([machine({ name: 'Washer', location: 'home', model: 'WF45' })])
  const facts = renderWithConvex(<MachineSheet householdId="h1" group={group!} onClose={() => undefined} />)
  expect(facts).toContain('Appliance facts')
  expect(facts).toContain('Capacity')
  expect(facts).toContain('WF45')
  expect(facts).not.toContain('Add details')
})
