import { expect, test } from 'vitest'
import { compileDirections } from '@washcloset/planner'
import manifest from '../docs/research/owner-product-integration/output/manifest.json'
import tideAdditions from '../docs/research/owner-product-integration/tide-additions/output/manifest.json'
import { catalogDirectionDraft } from './catalogDirectionAdapter'

function draft(id: string, selectedClaimIds?: string[]) {
  const entry = [...manifest.entries, ...tideAdditions.entries].find((entry) => entry.variant.key === `owner-reference:${id}:us`)!
  const binding = [...manifest.entryBindings, ...tideAdditions.entryBindings].find((binding) => binding.variantKey === entry.variant.key)!
  return catalogDirectionDraft({ variantKey: entry.variant.key, digest: binding.digest, claims: entry.claims, selectedClaimIds: selectedClaimIds ?? entry.claims.map((claim) => claim.id) })
}

test('the actual Tide packet maps partial native bars and HE full without synthetic conversions', () => {
  const value = draft('tide-original-liquid-121108')
  expect(value.missingClaimIds).toEqual([])
  expect(value.requiredClaimIds).toEqual(['directions-main-wash-0', 'function', 'handling'])
  const he = value.options.find((option) => option.id === 'tide-he')!
  expect(he.blockers).toEqual([])
  expect(he.table?.measure).toEqual({ kind: 'cap', marks: [{ label: 'Bar 1' }, { label: 'Bar 3' }, { label: 'Bar 5' }] })
  const compiled = compileDirections(he.table!, 'chemical')
  expect(compiled.ok && compiled.rules.map((rule) => rule.dose)).toEqual([
    { amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 3', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 5' },
  ])
  expect(value.options.find((option) => option.id === 'tide-standard')?.table?.rows).toHaveLength(2)
  expect(value.limitations.join(' ')).toContain('deep-fill')
})

test('revision drift and unknown names cannot be adapted even when claim IDs look familiar', () => {
  expect(catalogDirectionDraft({ variantKey: 'owner-reference:tide-original-liquid-121108:us', digest: 'changed', claims: [], selectedClaimIds: [] }).options).toEqual([])
  expect(catalogDirectionDraft({ variantKey: 'tide-free-gentle', digest: manifest.entryBindings.at(-1)!.digest, claims: [], selectedClaimIds: [] }).options).toEqual([])
  expect(draft('tide-original-liquid-121108', ['directions-main-wash-0']).missingClaimIds).toEqual(['function', 'handling'])
})

test('sanitizer retains native machine columns and 16-minute rinse contact, with separate unresolved presoak', () => {
  const value = draft('lysol-crisp-linen-line-1833')
  const rinse = value.options.find((option) => option.id === 'lysol-rinse')!
  expect(rinse.table?.rows[0]?.cells).toEqual([
    { machineClass: 'he', amount: 2, unit: 'cap', mark: 'Line 2' },
    { machineClass: 'standard', amount: 2, unit: 'cap', mark: 'Line 1' },
  ])
  expect(value.requiredClaimIds).toContain('rinse-minimum-contact')
  expect(rinse.table?.timing).toContain('16 minutes before draining')
  expect(value.options.find((option) => option.id === 'lysol-presoak')?.blockers.join(' ')).toContain('15-minute presoak')
  expect(value.limitations.join(' ')).toContain('discontinued')
})

test('Downy native approximation and Oxi wash routes compile while treatments stay unsupported', () => {
  const downy = draft('downy-rinse-refresh-free-gentle-103111')
  expect(downy.options.find((option) => option.id === 'downy-rinse')?.table?.rows[0]?.cells[0]).toEqual({ amount: 0.25, unit: 'US_cup', approximate: true })
  expect(downy.options.find((option) => option.id === 'downy-half-dispenser')?.table?.rows[0]?.cells[0]).toEqual({ amount: 0.5, unit: 'dispenser' })
  expect(downy.restrictions.map((claim) => claim.text)).toContain('Do not use with bleach')
  const powder = draft('oxiclean-versatile-free')
  expect(powder.options[0]?.table?.rows[0]?.cells[0]).toEqual({ amount: 1, unit: 'scoop', mark: 'Line 1' })
  expect(powder.options.find((option) => option.id === 'oxi-wash')?.blockers).toEqual([])
  expect(powder.options.find((option) => option.id === 'oxi-soak')?.blockers.length).toBeGreaterThan(0)
  const paks = draft('oxiclean-white-revive-paks')
  expect(paks.options[0]?.table?.rows[0]?.cells[0]).toEqual({ amount: 1, unit: 'pod' })
  expect(paks.options.find((option) => option.id === 'paks-soak')?.blockers.join(' ')).toContain('No supported Pak-to-water')
  for (const value of [powder, paks]) {
    expect(value.requiredClaimIds).toContain('restriction-0')
    expect(value.missingClaimIds).toEqual([])
    for (const option of value.options) if (option.table !== null) expect(compileDirections(option.table, 'chemical').ok).toBe(true)
  }
})

test('exact additional Tide variants retain qualitative marks and source-native 1/2/3 categories', () => {
  const liquid = draft('tide-free-gentle-235843')
  const he = liquid.options.find((option) => option.id === 'tide-free-gentle-he')!
  expect(he.blockers).toEqual([])
  expect(he.table?.rows.map((row) => row.cells[0])).toEqual([
    { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below', machineClass: 'he' },
    { amount: 1, unit: 'cap', mark: 'Bar 3', target: 'just_below', machineClass: 'he' },
    { amount: 1, unit: 'cap', mark: 'Bar 5', machineClass: 'he' },
  ])
  const pods = draft('tide-pods-spring-meadow-032503').options.find((option) => option.id === 'tide-pods')!
  expect(pods.blockers).toEqual([])
  expect(pods.table?.rows.map((row) => [row.sourceLoadCategories, row.loadSizes, row.cells[0]?.amount])).toEqual([[['smaller'], undefined, 1], [['standard'], undefined, 2], [['larger'], undefined, 3]])
  expect(pods.table?.timing).toContain('Dry hands')
  expect(pods.table?.timing).toContain('never cut, puncture, open')
})
