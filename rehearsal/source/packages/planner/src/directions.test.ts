import assert from 'node:assert/strict'

import type { CompiledRule, DirectionsTable } from './index'

const { compileDirections, directionsCoverage, rowTextFor } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const cap = { kind: 'cap' as const, marks: [{ label: '1' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] }
const cells = (he: string, standard: string) => [{ machineClass: 'he' as const, amount: 1, unit: 'cap', mark: he }, { machineClass: 'standard' as const, amount: 1, unit: 'cap', mark: standard }]

/** Tide's cap: Medium 1, Large 3, Extra large 5, and "Large / heavily soiled" 3, with HE and standard columns. */
const tide: DirectionsTable = {
  measure: cap,
  stage: 'wash',
  placement: 'detergent_compartment',
  timing: 'before cycle start',
  rows: [
    { loadSizes: ['medium'], cells: cells('1', '3') },
    { loadSizes: ['large'], cells: cells('3', '5') },
    { loadSizes: ['extra_large'], cells: cells('5', '5') },
    { rowText: 'Large / heavily soiled', loadSizes: ['large'], soilLevels: ['heavy'], join: 'or', cells: cells('3', '5') },
  ],
}

const compiled = compileDirections(tide, 'chemical')
if (!compiled.ok) throw new Error(`the Tide cap table compiles: ${compiled.error}`)
const rules: CompiledRule[] = compiled.rules
assert.equal(rules.length, 10, 'three plain rows and one or-row, each in two columns')
const orRow = rules.filter((rule) => rule.row === 4)
assert.deepEqual(orRow.map((rule) => rule.conditions), [
  { loadSizes: ['large'], machineClasses: ['he'] },
  { soilLevels: ['heavy'], machineClasses: ['he'] },
  { loadSizes: ['large'], machineClasses: ['standard'] },
  { soilLevels: ['heavy'], machineClasses: ['standard'] },
], 'an or-row is one rule per condition, sharing the row')
assert.ok(orRow.every((rule) => rule.rowText === 'Large / heavily soiled'), 'a typed heading is kept')
assert.equal(rules.find((rule) => rule.row === 1)?.rowText, undefined, 'an untyped heading is not stored as if printed')
assert.deepEqual(rules.find((rule) => rule.row === 1)?.conditions, { loadSizes: ['medium'], machineClasses: ['he'] }, 'other rows are never given soil complements')
assert.deepEqual(rules[0]?.dose, { amount: 1, unit: 'cap', mark: '1' })

const coverage = directionsCoverage(rules, cap, { sizes: ['small', 'medium', 'large', 'extra_large'], soils: ['normal', 'heavy'], classes: ['he'] })
const at = (size: string, soil: string) => coverage.find((cell) => cell.size === size && cell.soil === soil)!.selection
const markAt = (size: string, soil: string) => { const selection = at(size, soil); return selection.kind === 'selected' ? selection.dose.mark : selection.kind }
assert.equal(markAt('medium', 'normal'), '1')
assert.equal(markAt('large', 'heavy'), '3', 'both halves of the or-row agree')
assert.equal(markAt('small', 'heavy'), '3', 'a small heavily soiled load fits the or-row')
assert.equal(markAt('small', 'normal'), 'none', 'the label has no small row')
assert.equal(markAt('medium', 'heavy'), 'conflict', 'a medium heavily soiled load fits two rows and asks')
assert.equal(markAt('extra_large', 'heavy'), 'conflict', 'an extra-large heavily soiled load is never dosed at line 3 by accident')

// Refusals, in plain words.
const refused = (table: DirectionsTable, kind = 'chemical') => { const result = compileDirections(table, kind); return result.ok ? null : result.error }
assert.match(refused({ ...tide, rows: [{ loadSizes: ['medium'], cells: cells('2', '3') }] })!, /"2" is not a mark on the cap/)
assert.match(refused({ ...tide, rows: [{ cells: [{ amount: 1, unit: 'cap' }] }] })!, /Say which mark/)
assert.match(refused({ ...tide, measure: { kind: 'count', countUnit: 'pod' }, rows: [{ cells: [{ amount: 1.5, unit: 'pod' }] }] })!, /whole number/)
assert.match(refused({ ...tide, rows: [{ loadSizes: ['medium'], cells: cells('1', '3') }, { loadSizes: ['large'], cells: [{ amount: 1, unit: 'cap', mark: '3' }] }] })!, /same columns/)
assert.match(refused({ ...tide, stage: 'dry' })!, /where the product goes in the washer/)
assert.match(refused({ measure: { kind: 'count', countUnit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer', rows: [{ soilLevels: ['heavy'], cells: [{ amount: 2, unit: 'sheet' }] }] }, 'dryer_sheet')!, /do not dose by soil/)
assert.match(refused({ ...tide, rows: [{ cells: cells('1', '3') }, { cells: cells('3', '5') }] })!, /Only one row can apply to every load/)
assert.match(refused({ ...tide, measure: { kind: 'cap', marks: [{ label: 'Line 1' }, { label: 'line 1' }] } })!, /listed twice/)
assert.match(refused({ ...tide, measure: { kind: 'cap', marks: [{ label: '1', amount: 30 }] } })!, /needs an amount and a unit/)
assert.ok(compileDirections({ ...tide, rows: [{ loadSizes: ['medium'], cells: [{ machineClass: 'he', amount: 1, unit: 'cap', mark: '1' }] }] }, 'chemical').ok, 'an HE-only label can be transcribed as HE-only')
const sheetsTable = compileDirections({ measure: { kind: 'count', countUnit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer', rows: [{ cells: [{ amount: 1, unit: 'sheet' }] }] }, 'dryer_sheet')
assert.ok(sheetsTable.ok && sheetsTable.rules[0]?.placement === 'dryer_drum', 'a dryer product compiles into the dryer drum')

// Headings for untyped rows.
assert.equal(rowTextFor({ loadSizes: ['large'], soilLevels: ['heavy'], join: 'or' }), 'Large / heavily soiled')
assert.equal(rowTextFor({ loadSizes: ['medium'], soilLevels: ['normal'] }), 'Medium, normal soil')
assert.equal(rowTextFor({ loadSizes: ['medium', 'large', 'extra_large'] }), 'Medium–extra large')
assert.equal(rowTextFor({ soilLevels: ['heavy'] }), 'Heavily soiled')
assert.equal(rowTextFor({}), 'Any load')

console.log('directions checks passed')
