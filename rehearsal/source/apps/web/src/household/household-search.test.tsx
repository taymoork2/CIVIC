import { expect, test } from 'vitest'
import { matchesHouseholdSearch, MachinesView, BottlesView } from '@/household/household-page'
import { renderToStaticMarkup } from '@/test/markup'
import type { Machine, Supply } from '@/household/inventory-types'
import { ProductTile } from '@/household/household-tiles'
import { FactsCard } from '@/household/household-blocks'

test('household search matches all words across recorded fields and handles unknowns', () => {
  const words = ['Washer 2', 'ABC-123', 'top_load_washer', 'Shared laundry room', null]
  for (const query of ['', '  ', 'ABC shared', 'TOP washer', 'room 2']) expect(matchesHouseholdSearch(query, words)).toBe(true)
  for (const query of ['dryer', 'ABC home', '123 detergent']) expect(matchesHouseholdSearch(query, words)).toBe(false)
  expect(matchesHouseholdSearch('liquid detergent', ['Tide', 'liquid', 'detergent'])).toBe(true)
  expect(matchesHouseholdSearch('bleach', ['Tide', undefined, 'detergent'])).toBe(false)
})

test('empty appliance and product lists lead directly into intake without an empty search', () => {
  const machines = renderToStaticMarkup(<MachinesView machines={[]} currency="USD" place="home" onOpen={() => {}} onHomePair={() => {}} />)
  const products = renderToStaticMarkup(<BottlesView supplies={[]} onOpen={() => {}} />)
  expect(machines).toContain('Add your washer and dryer')
  expect(products).toContain('Add a product')
  for (const html of [machines, products]) {
    expect(html).not.toContain('type="search"')
    expect(html).not.toContain('No products yet.')
    expect(html).not.toContain('No appliances yet.')
  }
})

test('appliance counts include every machine in a group and keep removed records separate', () => {
  const base: Omit<Machine, 'machineId'> = { name: 'Washer', model: null, applianceType: 'front_load_washer', location: 'shared', archived: false, highEfficiency: null, heatSettings: [], capacityUnits: null, capacityConfidence: 'unknown', availability: 'available', blockMinutes: null, supportedCycles: [], placements: [], cycleMinutes: {}, pricePerStart: null, drumVolume: null, provenance: { source: 'Synthetic check', confidence: 'user-supplied' } }
  const machines = [1, 2].map(i => ({ ...base, machineId: `m${i}` as Machine['machineId'] }))
  machines.push({ ...base, machineId: 'removed' as Machine['machineId'], archived: true })
  const html = renderToStaticMarkup(<MachinesView machines={machines} currency="USD" place="shared" onOpen={() => {}} onHomePair={() => {}} />)
  expect(html).toContain('2 appliances · 1 removed')
  expect(html).toContain('Open appliance')
  expect(html).not.toContain('Edit settings')
})

test('product accessible names retain ran-out state and facts keep native definition semantics', () => {
  const supply: Supply = { supplyId: 's1' as Supply['supplyId'], name: 'Trial detergent', kind: 'chemical', use: 'detergent', formulation: { name: 'Trial detergent', form: 'pods' }, measure: null, provenance: { source: 'Synthetic check', confidence: 'user-supplied' }, rules: [], archived: false, ranOutAt: 123 }
  const html = renderToStaticMarkup(<ProductTile supply={supply} onOpen={() => {}} />)
  expect(html).toMatch(/aria-label="[^"]*Ran out[^\"]*Open product"/)
  const facts = renderToStaticMarkup(<FactsCard label="Checked facts" rows={[
    ['Type', 'Pods'], ['Name', 'Trial detergent', () => {}],
  ]} />)
  expect(facts).toContain('<dt')
  expect(facts).toContain('<dd')
  expect(facts).toContain('role="group" aria-label="Checked facts"')
  expect(facts).not.toMatch(/<dl[^>]*>[^]*<button[^>]*>[^]*<\/dl>/)
})
